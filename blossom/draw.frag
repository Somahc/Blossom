/* framework header */
#version 430
layout(location = 0) out vec4 fragColor;
layout(location = 0) uniform vec4 iResolution;
layout(location = 1) uniform int iFrame;
#define NUM_MAT 4 // マテリアル数
vec3 color[NUM_MAT] = {vec3(0.8), vec3(0.2, 0.8, 0.2), vec3(0.8, 0.2, 0.2), vec3(0.2, 0.2, 0.8)};
vec3 emission[NUM_MAT] = {vec3(0.), vec3(0.), vec3(10.), vec3(0.)};
float roughness[NUM_MAT] = {1.0,0.,0.5,0.5};
float metallic[NUM_MAT] = {0., 1., 1., 0.};
const float PI = acos(-1.);

uint seed;
uint PCGHash(){
    seed = seed * 747796405u + 2891336453u;
    uint state = seed;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) * word;
}

float rnd1(){
    return PCGHash() / float(0xFFFFFFFFU);
}

vec2 rnd2(){
    return vec2(rnd1(), rnd1());
}

float sd_sphere(vec3 p){
    return length(p) - 0.5; 
}

float sdf_box(vec3 pos, vec3 size){
    vec3 d = abs(pos) - size;
    return min(max(d.x, max(d.y, d.z)), 0.) + length(max(d,0.));
}

// 最も近いSDFの情報
struct SDFInfo{
    int index;
};

void tangentSpaceBasis(vec3 normal, inout vec3 tangent, inout vec3 binormal){
    vec3 d = vec3(0,1,0);
    if(abs(normal.y) > .99) d = vec3(0,0,1);
    tangent = normalize(cross(normal, d));
    binormal = normalize(cross(tangent, normal));
}

vec3 worldToLocal(vec3 tangent, vec3 normal, vec3 binormal, vec3 world){
    return vec3(dot(world, tangent), dot(world, normal), dot(world, binormal));
}

vec3 localToWorld(vec3 tangent, vec3 normal, vec3 binormal, vec3 local){
    return tangent * local.x + binormal * local.z + normal * local.y;
}

vec3 hemisphereSampling(vec2 uv){
    float theta = acos(uv.x);
    float phi = 2. * PI * uv.y;
    return vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
}

vec3 cosineSampling(vec2 uv, inout float pdf){
    float theta = acos(1. - 2.0f * uv.x) * .5;
    float phi = 2. * PI * uv.y;
    pdf = cos(theta) / PI;
    return vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
}

vec3 IBL(vec3 dir){
    return vec3(4.);
}

vec3 shlickFresnel(vec3 F0,float cosTheta){
    float delta = 1.0 - cosTheta;
    return F0 + (1.0 - F0) * delta * delta * delta * delta * delta;
}

float GGX_Lambda(vec3 v,float alpha) {
    float delta = 1.0f + (alpha * alpha * v.x * v.x + alpha * alpha * v.z * v.z) / (v.y * v.y);
    return (-1.0 + sqrt(delta)) / 2.0f;
}

float GGX_D(vec3 wm,float alpha) {
    float term1 = wm.x * wm.x / (alpha * alpha) + wm.z * wm.z / (alpha * alpha) + wm.y * wm.y;
    float term2 = PI * alpha * alpha * term1 * term1;
    return 1.0f / term2;
}

float GGX_G1(vec3 w,float alpha) {
    return 1.0f / (1.0f + GGX_Lambda(w,alpha));
}

float GGX_G2_HeightCorrelated(vec3 wi, vec3 wo,float alpha) {
    return 1.0f / (1.0f + GGX_Lambda(wi,alpha) + GGX_Lambda(wo,alpha));
}

vec3 ggx_halfsampling(vec2 uv,float alpha){
    float theta = atan(alpha * sqrt(uv.x) / sqrt(max(1.0 - uv.x,0.0)));
    float phi = 2.0 * PI * uv.y;
    return vec3(sin(theta) * cos(phi),cos(theta),sin(theta) * sin(phi));
}

vec3 sampleVisibleNormal(vec2 uv, vec3 wo,float alpha) {
    vec3 strech_wo = normalize(vec3(wo.x * alpha, wo.y, wo.z * alpha));
    float phi = 2.0f * PI * uv.x;
    float z = fma((1.0f - uv.y), (1.0f + strech_wo.y), -strech_wo.y);
    float sinTheta = sqrt(clamp(1.0f - z * z, 0.0f, 1.0f));
    float x = sinTheta * cos(phi);
    float y = sinTheta * sin(phi);
    vec3 c = vec3(x, z, y);
    vec3 h = c + strech_wo;

    vec3 wm = normalize(vec3(h.x * alpha, h.y, h.z * alpha));
    return wm;
}

float pdfLambert(vec3 wi){
    return wi.y / PI;
}

float pdfGGX(vec3 wo,vec3 wm,float alpha){
    return 0.25f * GGX_D(wm,alpha) * dot(wo, wm) / (dot(wm, wo) * abs(wo.y)* (1.0f + GGX_Lambda(wo,alpha)));
}

float map(vec3 p,inout SDFInfo info){
    float d;
    d = sd_sphere(p);

    float room_d;
    float outside_d = sdf_box(p, vec3(17, 7, 17));
    float inside_d = sdf_box(p, vec3(15, 5, 15));
    float hole_d = sdf_box(p - vec3(0, 5, 0), vec3(5, 4, 5));
    room_d = max(outside_d, -inside_d);
    room_d = max(room_d, -hole_d);

    info.index = 0;
    info.index = (d < room_d) ? 1 : info.index;
    d=min(d, room_d);

    float blueSphere = sd_sphere(p - vec3(2., 0., 0.));
    float redSphere = sd_sphere(p + vec3(2., 0., 0.));

    info.index = (blueSphere < d) ? 3 : info.index;
    d = min(d, blueSphere);
    info.index = (redSphere < d) ? 2 : info.index;
    d = min(d, redSphere);

    return d;
}

vec3 get_normal(vec3 p){
    vec2 eps = vec2(0.001,0.0);
    SDFInfo dammy;
    return normalize(vec3(
        map(p+eps.xyy,dammy)-map(p-eps.xyy,dammy),
        map(p+eps.yxy,dammy)-map(p-eps.yxy,dammy),
        map(p+eps.yyx,dammy)-map(p-eps.yyx,dammy)
    ));
}

struct SurfaceInfo{
    float ray_dist;
    vec3 color;
    vec3 emission; // ライトの明るさ
    float roughness;
    vec3 normal;
    vec3 position;
    vec3 metallic;
};

vec3 BSDF(vec3 wo, inout vec3 wi, SurfaceInfo info){
    //Lambert
    //wi = cosineSampling(rnd2(),pdf);
    //vec3 bsdf = info.color / PI; 

    float alpha = clamp(info.roughness * info.roughness,0.001,1.0);
    vec3 F0 = mix(vec3(.04), info.color, info.metallic);

    float dif_weight = float(1. - info.metallic);
    float spec_weight = 1.;
    float sum_weight = dif_weight + spec_weight;

    float cd = dif_weight / sum_weight;
    float cs = spec_weight / sum_weight;

    //GGX
    //WalterSampling
    //vec3 wm = ggx_halfsampling(rnd2(),alpha);

    //VisibleNoraml Sampling
    vec3 wm;
    float pdf_diffuse;
    float pdf_specular;
    if(rnd1() < cd){
        wi = cosineSampling(rnd2(), pdf_diffuse);
        wm = normalize(wi + wo);
        pdf_specular = pdfGGX(wo, wm, alpha);
    }else{
        wm = sampleVisibleNormal(rnd2(), wo, alpha);
        wi = reflect(-wo, wm);
        pdf_specular = pdfGGX(wo, wm, alpha);
        pdf_diffuse = pdfLambert(wi);
    }

    if(wi.y < 0.0){
        return vec3(0.0);
    }

    float pdf = cd * pdf_diffuse + cs * pdf_specular;

    float D = GGX_D(wm,alpha);
    float G = GGX_G1(wo,alpha) * GGX_G1(wi,alpha);
    vec3 F = shlickFresnel(info.color,dot(wm,wo));
    
    vec3 bsdf = D * G * F / (4.0 * wo.y * wi.y);
    
    //Walter Sampling
    //pdf = D * wm.y / (4.0 * dot(wm,wo));

    //Cosine Term
    float cosine = wi.y;

    return bsdf * cosine / pdf;
}

#define MAX_STEP 300
bool raymarching(vec3 ro,vec3 rd,inout SurfaceInfo info){
    float dist = 0.0;
    float sum_d = 0.0;
    SDFInfo sdf_info;
    for(int i = 0; i < MAX_STEP; i++){
        dist = map(ro + rd * sum_d,sdf_info);
        if(dist < 0.001){
            info.ray_dist = sum_d;
            info.position = ro + rd * sum_d;
            info.color = vec3(1.0); 
            info.normal = get_normal(info.position);
            info.color = color[sdf_info.index];
            info.emission = emission[sdf_info.index];
            info.roughness = roughness[sdf_info.index];
            return true;
        }
        sum_d += dist;
    }

    info.ray_dist = 100000.;
    info.color = vec3(0.0);
    info.normal = vec3(0.0);
    return false;
}

#define LIGHT_DIR normalize(vec3(.5, 1., 0.))
#define RTAO_NUM 16
#define MAX_DEPTH 10
vec3 render(vec3 ro, vec3 rd){
    vec3 LTE = vec3(0.); // 最終結果
    vec3 throughput = vec3(1.); // 反射率

    vec3 ray_ori = ro;
    vec3 ray_dir = rd;

    for(int i = 0; i < MAX_DEPTH; i++){

        float russian_p = clamp(max(max(throughput.x, throughput.y), throughput.z), 0., 1.);

        if (russian_p < rnd1()) break;
        throughput /= russian_p;


        SurfaceInfo info;
        if(!raymarching(ray_ori, ray_dir, info)){
            // 衝突しなかった場合
            LTE += throughput * IBL(ray_dir);
            break;
        }

        if(length(info.emission) > 0.){
            LTE += throughput * info.emission;
            break;
        }

        // 衝突した場合
        vec3 normal = info.normal;
        vec3 tangent, binormal;
        tangentSpaceBasis(normal, tangent, binormal);

        vec3 local_wo = worldToLocal(tangent, normal, binormal, -ray_dir);
        vec3 local_wi;

        throughput *= BSDF(local_wo, local_wi, info);
        vec3 wi = localToWorld(tangent, normal, binormal, local_wi);

        //レイの更新
        ray_dir = wi;
        ray_ori = info.position + ray_dir * .01;
    }

    return LTE;
}

void main()
{
    seed = uint((iFrame + 1) * (gl_FragCoord.x + iResolution.x * gl_FragCoord.y));

    vec2 uv = ((gl_FragCoord.xy + rnd2()) * 2.0 - iResolution.xy)/iResolution.y;

    vec3 color = vec3(0.);

    vec3 cam_ori = vec3(0.0,0.0,-3.0);
    vec3 cam_dir = normalize(vec3(uv,1.0));

    color = render(cam_ori, cam_dir);

    fragColor = vec4(color,1.0);
}
