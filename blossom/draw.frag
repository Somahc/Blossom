/* framework header */
#version 430
layout(location = 0) out vec4 fragColor;
layout(location = 0) uniform vec4 iResolution;
layout(location = 1) uniform int iFrame;
#define NUM_MAT 4 // マテリアル数
vec3 color[NUM_MAT] = {vec3(0.8), vec3(0.2, 0.8, 0.2), vec3(0.8, 0.2, 0.2), vec3(0.2, 0.2, 0.8)};

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

float rnd2(){
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
            info.position = ro + rd * sum_d;
            info.color = vec3(1.0); 
            info.normal = get_normal(info.position);
            info.color = color[sdf_info.index];
            return true;
        }
        sum_d += dist;
    }

    info.color = vec3(0.0);
    info.normal = vec3(0.0);
    return false;
}

#define LIGHT_DIR normalize(vec3(.5, 1., 0.))

vec3 render(vec3 ro, vec3 rd){
    vec3 color = vec3(0.);
    SurfaceInfo info;
    if(raymarching(ro, rd, info)){
        // 衝突時の処理
        vec3 shadow_dir = LIGHT_DIR;
        vec3 shadow_ori = info.position + shadow_dir * .02;
        SurfaceInfo shadow_info;
        bool hit = raymarching(shadow_ori, shadow_dir, shadow_info);
        float shadow = 1. - float(hit);

        color = info.color * (max(dot(info.normal, LIGHT_DIR), 0.) * shadow + 0.2);
    }else{
        color = vec3(0.);
    }
    
    return color;
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
