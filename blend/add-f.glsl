/**
 *
 * BlendAddf
 * 
 * Generated using the ../source/convert.js script.
 *
 */

float blendAddf(float base, float blend) {
	return min(base+blend,1.0);
}

#pragma glslify: export(blendAddf)