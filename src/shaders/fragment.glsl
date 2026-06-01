#version 300 es

precision highp float;
precision highp sampler2D;

in vec2 uv;
out vec4 out_color;

uniform vec2 u_resolution;
uniform sampler2D u_texture;

uniform float u_borderRadius;
uniform float u_distortion;
uniform float u_zoom;
uniform float u_blurRadius;
uniform float u_chromaticAberration;
uniform float u_frostStrength;
uniform float u_frostScale;
uniform float u_lightStrength;
uniform vec2 u_lightDirection;
uniform float u_edgeGlow;
uniform float u_edgeWidth;
uniform float u_tint;
uniform float u_alpha;

vec3 sampleTexture(vec2 coord) {
  vec2 st = coord / u_resolution.xy;
  st = clamp(st, vec2(0.0), vec2(1.0));
  return texture(u_texture, st).rgb;
}

float sdf(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + vec2(r);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

float random(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

vec3 optimizedBlur(vec2 coord, float radius) {
  vec3 color = vec3(0.0);
  float total = 0.0;

  for (int x = -5; x <= 5; x++) {
    for (int y = -5; y <= 5; y++) {
      vec2 offset = vec2(float(x), float(y));
      float dist = dot(offset, offset);
      float sigma = 4.0;
      float weight = exp(-dist / (2.0 * sigma * sigma));
      vec2 sampleCoord = coord + offset * (radius / 5.0);

      color += sampleTexture(sampleCoord) * weight;
      total += weight;
    }
  }

  return color / total;
}

void main() {
  vec2 fragCoord = uv * u_resolution;

  vec2 glassSize = u_resolution;
  vec2 glassCenter = u_resolution * 0.5;
  vec2 glassCoord = fragCoord - glassCenter;

  float size = min(glassSize.x, glassSize.y);

  float inversedSDF =
    -sdf(glassCoord, glassSize * 0.5, u_borderRadius) / size;

  if (inversedSDF < 0.0) discard;

  vec2 normal = normalize(glassCoord + 0.0001);

  float edgeDistance =
    1.0 - clamp(inversedSDF / 0.32, 0.0, 1.0);

  float lens =
    1.0 - sqrt(1.0 - pow(edgeDistance, 2.0));

  vec2 centeredCoord = fragCoord - glassCenter;
  vec2 zoomedCoord = glassCenter + centeredCoord / u_zoom;

  vec2 distortedCoord =
    zoomedCoord - lens * normal * glassSize * u_distortion;

  vec3 blurredColor = optimizedBlur(distortedCoord, u_blurRadius);

  float edge = smoothstep(0.0, 0.025, inversedSDF);
  vec2 chromaShift = normal * edge * u_chromaticAberration;

  vec3 color = vec3(
    optimizedBlur(distortedCoord - chromaShift, u_blurRadius).r,
    blurredColor.g,
    optimizedBlur(distortedCoord + chromaShift, u_blurRadius).b
  );

  float frost = noise(fragCoord / u_frostScale);
  color += (frost - 0.5) * u_frostStrength;

  vec2 lightDir = normalize(u_lightDirection);
  float light = pow(clamp(dot(-normal, lightDir), 0.0, 1.0), 2.0);
  color += light * u_lightStrength * edgeDistance;

  float border = smoothstep(u_edgeWidth, 0.0, abs(inversedSDF));
  color += border * u_edgeGlow;

  color *= vec3(u_tint);

  out_color = vec4(color, u_alpha);
}