/**
 *
 * BlendSoftLight
 * 
 * Generated using the ../source/convert.js script.
 *
 */

#pragma glslify: blendSoftLightf = require(./soft-light-f)

vec3 blendSoftLight(vec3 base, vec3 blend) {
	return vec3(blendSoftLightf(base.r,blend.r),blendSoftLightf(base.g,blend.g),blendSoftLightf(base.b,blend.b));
}

#pragma glslify: export(blendSoftLight)