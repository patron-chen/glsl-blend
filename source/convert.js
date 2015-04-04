/**
 *
 * Converts all the preprocessor blending functions to some standard blending function glslify goodness.
 *
 */

var fsUtil = require( 'fs' );
var pathUtil = require( 'path' );
var glsl = fsUtil.readFileSync( './ThanksPhotoshopMathFP.glsl', 'utf-8' );


var mapModes = { // map these modes to another mode.
    'BlendLinearDodgef':'BlendAddf',
    'BlendLinearBurnf':'BlendSubstractf',
    'BlendLighten':'BlendLightenf',
    'BlendDarken':'BlendDarkenf',
    'BlendLinearDodge':'BlendAdd',
    'BlendLinearBurn':'BlendSubstract'
};

// ignore from standard handling.
// blend is inlined, opacity is exported as seperate function for each mode
var ignoreModes = {
    'Blend': true,
    'BlendOpacity':true
};

var matches = glsl.match( /#define Blend.+\n/g ); // match preprocessor line.
var ppLine;
var chomp,c,b,name,sig,impl,entry;
var entryMap = {};
var modes = {};

for( var i = 0; i<matches.length; i++ )
{
    ppLine = matches[i].toString();

    chomp = '';
    b = 0;
    entry = {
        name: null,
        impl: null
    };
    for( var j = 0; j<ppLine.length;j++ ){
        c = ppLine[ j ];
        if( c === '(' && b === 0 ){
            b++;
            entry.name = chomp.replace( '#define ', '' );
        }
        if( c === ')' && b === 1){
            b++;
            entry.impl = '';
        }else
        if( b > 1 ){
            entry.impl+= c;
        }

        chomp += c;
    }
    if( b > 0 ){
        entry.impl = entry.impl.replace( /[\t\n ]/g, '');

        if( entry.impl[0] == '(' ){ // some clean up of () wrappers
            entry.impl = entry.impl.slice( 1, -1 );
        }

    }

    // null entries will be mapped to another most likely.
    if( entry.name !== null ){
        if( entry.name.slice( -1 ) === 'f' ){
            entry.float = true;
        }else{
            entry.float = false;
        }
        entryMap[ entry.name ] = entry;
    }
}

// map others..
for( var map in mapModes ){
    entry = {
        name: map,
        impl: entryMap[ mapModes[ map] ].impl,
        implMod: null, // assigned below - final impl after mod
        //mapTo: entryMap[ mapModes[ map ] ],
        float: entryMap[ mapModes[ map] ].float,
        comments: 'Note : Same implementation as ' + entryMap[ mapModes[ map]].name,
        opacityBlend: false // see below

    };

    entryMap[ entry.name ] = entry;
}


// add function names &
// add opacity blend modes.
// we can't pass functions so we'll export a separate function for each mode.
// #define BlendOpacity(base, blend, F, O) 	(F(base, blend) * O + blend * (1.0 - O))

var entryO;
var opacityImpl = '(F(base, blend) * opacity + blend * (1.0 - opacity))';
for( name in entryMap )
{
    entry = entryMap[ name ];
    // opacity blend modes.
    if( !entry.float && !ignoreModes[ entry.name ] )
    {
        // TODO : Create float modes for opacity?

        entryO = {
            name: name + 'o',
            opacityBlend: true,
            impl: opacityImpl.replace( 'F', entry.name ),
            implMod: null,
            float: false,
            functionName: null
        };

        entryMap[ entryO.name ] = entryO;
    }

}

// finalise

for( name in entryMap )
{
    entry = entryMap[ name ];
    // generate file name

    chomp = '';

    for( j = 0; j<name.length; j++ ) {
        c = name[ j ];
        if(c.match( /[A-Z]/ ) && j > 0){
            chomp += '-' + c.toLowerCase();
        }else{
            chomp += c.toLowerCase();
        }
    }

    var mode = chomp;

    if( chomp[ chomp.length-1 ] === 'f' ){
        mode = chomp.slice( 0,-1 );
        chomp = chomp.slice( 0,-1 ) + '-f';
    }else
    if( chomp[ chomp.length-1 ] === 'o' ){
        mode = chomp.slice( 0,-1 );
        chomp = chomp.slice( 0,-1 ) + '-o';
    }

    // mode
    // remove the blend- bit.. so names become e.g. 'blend/hard-light.glsl'
    entry.filename = chomp.replace( 'blend-', '' );
    entry.mode = mode.replace( 'blend-', '' );
    //entry.functionName = name[0].toLowerCase() + name.slice(1);

    entry.functionName = entry.mode.split('-').map(function(s){
        return s[0].toUpperCase() + s.slice(1);
    }).join('');
    entry.functionName = entry.functionName[0].toLowerCase() + entry.functionName.slice( 1 );

    // store entries by mode.
    if( !modes[ entry.mode ] ){
        modes[ entry.mode ] = [];
    }

    modes[ entry.mode ].push( entry );
}

// determine dependencies..

for( name in entryMap )
{
    entry = entryMap[ name ];

    // dependencies..
    entry.deps = [];

    var deps = [];
    var d;
    for( d in entryMap ) {
        deps.push( d + '[\\(\\)]' );
    }

    matches = entry.impl.match( new RegExp( deps.join('|'), 'g' ) );

    entry.implMod = entry.impl;
    if( matches ){
        var andBlend = false;

        for( j = 0; j<matches.length; j++ ){
            d = entryMap[ matches[j].slice(0,-1) ];

            // replace the impl with our deps correct function names
            if(d.name === 'Blend'){
                andBlend = true; // handle last otherwise we may overwrite
            }else{
                entry.implMod = entry.implMod.replace(d.name, d.functionName);

                // Don't push Blend function - we are inlining this method.
                entry.deps.push( d );
            }
        }
        if( andBlend ){ // probably removing blend anyway
            entry.inlineBlend = true; // we will inline the blend method instead of requiring it.
            entry.implMod = entry.implMod.replace('Blend', 'blend');
        }
    }
}

var content;
var allContent = '';

for( name in entryMap )
{
    entry = entryMap[ name ];

    if( !ignoreModes[ name ] )
    {
        content = '';
        if( entry.float ){
            content += 'float ' + entry.functionName + '(float base, float blend) {\n';
        }else
        if( entry.opacityBlend ){
            content += 'vec3 ' + entry.functionName + '(vec3 base, vec3 blend, float opacity) {\n';
        }else{
            content += 'vec3 ' + entry.functionName + '(vec3 base, vec3 blend) {\n';
        }

        if( entry.comments ){
            content += '\t// ' + entry.comments + '\n';
        }

        // could modify these implementations so similar to
        // https://github.com/mattdesl/glsl-blend-soft-light'
        // but this will do for now.

        if( entry.inlineBlend ){
            // blend function..
            //#define Blend(base, blend, funcf) 		vec3(funcf(base.r, blend.r), funcf(base.g, blend.g), funcf(base.b, blend.b))
            // this works for all functions that require it
            var inline = entryMap[ 'Blend' ].impl;
            content += '\t' + 'return ' + inline.replace( /funcf/g, entry.deps[0].functionName ) + ';';
            content += '\n';

        }else{
            content += '\treturn ' + entry.implMod + ';\n';
        }
        content += '}';

    }

    if( !ignoreModes[ entry.name ] )
    {
        allContent += content + '\n\n\n';
        entry.content = content;
    }

}


fsUtil.writeFileSync( 'debug.glsl', allContent );


// export content for each mode in one file.
var dep;

for( mode in modes ){
    if( mode === 'blend' || mode === 'opacity' ){
        continue;
    }

    entry = modes[ mode ];

    deps = {};
    for( i = 0; i<entry.length; i++ ){
        for( j = 0; j<entry[i].deps.length; j++ ){
            dep = entry[i].deps[j];
            if( !deps[dep.mode] && dep.mode !== mode ) { // not in the same file. ( not same mode )
                deps[dep.mode] = dep;
            }
        }
    }

    content = '';

    for( dep in deps ) { // dep is a mode
        content = '#pragma glslify: ' + deps[dep].functionName + ' = require(' + './' + dep + ')\n' + content;
    }
    if( content.length !== 0 ){
        content += '\n';
    }

    content += entry.map( function( obj ){
        return obj.content;
    }).join( '\n\n' );

    content += '\n\n#pragma glslify: export(' + entry[0].functionName + ')';

    fsUtil.writeFileSync( '../' + mode + '.glsl', content );
}

// modes enum

var int = 0;
modesEnum = [];
var modesSorted = [];
for( mode in modes ){
    if( mode === 'blend' || mode === 'opacity' ){
        continue;
    }
    modesSorted.push( mode );
}

modesSorted.sort();

modesEnum = modesSorted.map( function( mode ){
    return '\t' + mode.replace('-','_').toUpperCase() + ':' + ( ++int )
});

fsUtil.writeFileSync( '../modes.js', 'module.exports = {\n' + modesEnum.join(',\n') + '\n};' );

// export a 'super' function for all blend modes.

var allFunction = '';
for( mode in modesSorted ){
    mode = modesSorted[ mode ];
    console.log( 'mode ', mode );
    allFunction += '#pragma glslify: ' + modes[mode][0].functionName + ' = require(./' + mode + ');\n';

}

var ifs = [];
var ifStatement;
allFunction += '\n\n';
allFunction += 'vec3 blendMode( int mode, vec3 base, vec3 blend ){\n';
int = 0;
for( mode in modesSorted ){
    mode = modesSorted[ mode ];

    ifStatement = '\tif( mode == ' + (++int) + ' ){\n'
    ifStatement+= '\t\treturn ' + modes[mode][0].functionName + '( base, blend );\n';
    ifStatement+= '\t}';
    ifs.push( ifStatement );
}

allFunction += ifs.join( 'else{\n' );

allFunction += '\n}\n';
allFunction += '#pragma glslify:export(blendMode)';

fsUtil.writeFileSync( '../all.glsl', allFunction );
