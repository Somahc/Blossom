/* framework header */
#version 430
layout(location = 0) out vec4 fragColor;
layout(location = 0) uniform vec4 iResolution;
layout(location = 1) uniform int iFrame;
#define NUM_MAT 4 // マテリアル数
vec3 color[NUM_MAT] = {vec3(0.8), vec3(0.2, 0.8, 0.2), vec3(0.8, 0.2, 0.2), vec3(0.2, 0.2, 0.8)};
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
    return vec3(1.);
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
    vec3 normal;
    vec3 position;
};

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
        SurfaceInfo info;
        if(!raymarching(ray_ori, ray_dir, info)){
            // 衝突しなかった場合
            LTE += throughput * IBL(ray_dir);
            break;
        }

        // 衝突した場合
        vec3 normal = info.normal;
        vec3 tangent, binormal;
        tangentSpaceBasis(normal, tangent, binormal);

        vec3 local_wo = worldToLocal(tangent, normal, binormal, -ray_dir);

        // 方向サンプリング
        float pdf;
        vec3 local_wi = cosineSampling(rnd2(), pdf);

        vec3 wi = localToWorld(tangent, normal, binormal, local_wi);

        // BSDFの計算
        vec3 bsdf = info.color / PI; // Lambert
        float cosine = dot(wi, normal);

        // throughputの更新
        throughput *= bsdf * cosine / pdf;

        //レイの更新
        ray_dir = wi;
        ray_ori = info.position + ray_dir * .01;
    }

    return LTE;

    // vec3 color = vec3(0.);
    // SurfaceInfo info;
    // if(raymarching(ro, rd, info)){
    //     // 衝突時の処理

    //     // shadow
    //     vec3 shadow_dir = LIGHT_DIR;
    //     vec3 shadow_ori = info.position + shadow_dir * .02;
    //     SurfaceInfo shadow_info;
    //     bool hit = raymarching(shadow_ori, shadow_dir, shadow_info);
    //     float shadow = 1. - float(hit);

    //     // AO
    //     vec3 tangent, binormal;
    //     tangentSpaceBasis(info.normal, tangent, binormal);

    //     float RTAO = 0.;
    //     for(int i = 0; i < RTAO_NUM; i++){
    //         vec3 dir = hemisphereSampling(rnd2());
    //         dir = localToWorld(tangent, info.normal, binormal, dir);
    //         vec3 ori = info.position + dir * .02;
    //         SurfaceInfo rtao_info;
    //         bool hit = raymarching(ori, dir, rtao_info);

    //         if(rtao_info.ray_dist < 1.){
    //             RTAO += float(hit);
    //         }
    //     }

    //     RTAO = (1. - RTAO / RTAO_NUM);

    //     color = info.color * (max(dot(info.normal, LIGHT_DIR), 0.) * shadow + 0.2) * RTAO;
    // }else{
    //     color = vec3(0.);
    // }
    
    // return color;
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
