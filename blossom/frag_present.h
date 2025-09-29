// Generated with Shader Minifier 1.3.6 (https://github.com/laurentlb/Shader_Minifier/)
#ifndef FRAG_PRESENT_H_
# define FRAG_PRESENT_H_
# define VAR_accumulatorTex "l"
# define VAR_fragColor "v"
# define VAR_iResolution "u"

const char *present_frag =
 "#version 430\n"
 "layout(location=0) out vec4 v;"
 "layout(location=0) uniform vec4 u;"
 "layout(binding=0) uniform sampler2D l;"
 "void main()"
 "{"
   "vec4 u=texelFetch(l,ivec2(gl_FragCoord.xy),0);"
   "v=vec4(u.xyz/u.w,1);"
 "}";

#endif // FRAG_PRESENT_H_
