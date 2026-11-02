// WebGL Majestic Shader Engine

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_filterIntensity; // 0.0 (clean) to 1.0 (majestic)
  uniform float u_bloomStrength;   // 0.2 to 2.5
  uniform vec2 u_resolution;
  uniform bool u_mirror;
  uniform float u_cameraZoom;      // 0.65 to 1.3

  // Multi-tap Poisson/Gaussian kernel offsets
  const int TAPS = 16;

  void main() {
    vec2 coord = v_texCoord;
    if (u_mirror) {
      coord.x = 1.0 - coord.x;
    }

    // Camera zoom scale + subtle slow-motion pulse while pose is held
    float pulse = sin(u_time * 2.2) * 0.015;
    float zoom = u_cameraZoom + (0.02 * pulse) * u_filterIntensity;
    vec2 centeredUv = (coord - 0.5) / zoom + 0.5;

    // Fast path: if filter is completely off, render crisp original
    if (u_filterIntensity <= 0.001) {
      if (centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
        gl_FragColor = vec4(0.04, 0.04, 0.06, 1.0);
      } else {
        gl_FragColor = texture2D(u_texture, centeredUv);
      }
      return;
    }

    bool isOutOfBounds = centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0;
    vec2 validUv = clamp(centeredUv, 0.0, 1.0);
    vec2 distVec = validUv - 0.5;
    float dist = length(distVec);

    // 1. Subtle Chromatic Aberration (RGB shift)
    float aberration = 0.0055 * u_filterIntensity * (0.6 + 0.8 * dist);
    vec2 rCoord = clamp(centeredUv + distVec * aberration, 0.0, 1.0);
    vec2 gCoord = clamp(centeredUv, 0.0, 1.0);
    vec2 bCoord = clamp(centeredUv - distVec * aberration, 0.0, 1.0);

    float r = texture2D(u_texture, rCoord).r;
    float g = texture2D(u_texture, gCoord).g;
    float b = texture2D(u_texture, bCoord).b;
    vec3 baseColor = vec3(r, g, b);

    // 2. High-pass Luminance & Diffusion Bloom
    // Sample a wide radius ring for ethereal diffusion glow
    vec3 bloomAcc = vec3(0.0);
    float totalWeight = 0.0;
    vec2 texelSize = 1.0 / u_resolution;

    // Multi-radius diffusion samples (rings of 8 and 8)
    float r1 = 3.5 * (1.0 + 0.25 * sin(u_time * 1.5));
    float r2 = 7.5;
    
    // Golden halation tint
    vec3 goldenHalation = vec3(1.22, 1.02, 0.72);

    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.785398; // 2*PI/8
      vec2 offset1 = vec2(cos(angle), sin(angle)) * texelSize * r1;
      vec3 tapColor1 = texture2D(u_texture, clamp(centeredUv + offset1, 0.0, 1.0)).rgb;
      float lum1 = dot(tapColor1, vec3(0.299, 0.587, 0.114));
      float highlight1 = smoothstep(0.60, 0.95, lum1);
      bloomAcc += tapColor1 * highlight1 * 1.3;
      totalWeight += 1.0;

      vec2 offset2 = vec2(cos(angle + 0.392), sin(angle + 0.392)) * texelSize * r2;
      vec3 tapColor2 = texture2D(u_texture, clamp(centeredUv + offset2, 0.0, 1.0)).rgb;
      float lum2 = dot(tapColor2, vec3(0.299, 0.587, 0.114));
      float highlight2 = smoothstep(0.68, 1.0, lum2);
      bloomAcc += tapColor2 * highlight2 * 0.8;
      totalWeight += 0.8;
    }

    vec3 bloom = (bloomAcc / totalWeight) * goldenHalation * (u_bloomStrength * 1.45);

    // 3. Exposure & Contrast Boost with Lifted Matte Blacks
    // S-curve contrast
    vec3 contrasted = baseColor;
    contrasted = (contrasted - 0.5) * (1.0 + 0.32 * u_filterIntensity) + 0.5;
    
    // Lift matte blacks (ethereal filmic aesthetic: darks lift to soft warm charcoal)
    vec3 liftedBlacks = vec3(0.045, 0.038, 0.03) * u_filterIntensity;
    contrasted = max(contrasted, liftedBlacks);
    
    // Warm highlights & golden midtones
    vec3 warmShift = vec3(1.05, 1.02, 0.96);
    contrasted *= mix(vec3(1.0), warmShift, u_filterIntensity * 0.7);
    contrasted *= (1.0 + 0.18 * u_filterIntensity); // exposure boost

    // 4. Combine base + bloom glow
    // Screen blend for radiant ethereal skin glow
    vec3 combined = 1.0 - (1.0 - contrasted) * (1.0 - clamp(bloom * u_filterIntensity, 0.0, 0.95));

    // 5. Soft Vignette towards frame edges
    float vignette = 1.0 - smoothstep(0.55, 1.35, dist * 1.35);
    combined *= mix(1.0, vignette, 0.45 * u_filterIntensity);

    // 6. Subtle ethereal shimmer sparkle
    float shimmer = sin(centeredUv.y * 320.0 + u_time * 5.0) * cos(centeredUv.x * 320.0 + u_time * 4.0) * 0.015;
    combined += vec3(shimmer * u_filterIntensity);

    // Final smooth blend between clean feed and majestic grade
    vec3 original = texture2D(u_texture, validUv).rgb;
    vec3 finalOut = mix(original, combined, u_filterIntensity);
    if (isOutOfBounds) {
      gl_FragColor = vec4(0.04, 0.04, 0.06, 1.0);
    } else {
      gl_FragColor = vec4(clamp(finalOut, 0.0, 1.0), 1.0);
    }
  }
`;

export class WebGLFilterPipeline {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  private uTimeLoc: WebGLUniformLocation | null = null;
  private uFilterIntensityLoc: WebGLUniformLocation | null = null;
  private uBloomStrengthLoc: WebGLUniformLocation | null = null;
  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uMirrorLoc: WebGLUniformLocation | null = null;
  private uCameraZoomLoc: WebGLUniformLocation | null = null;

  public currentFilterIntensity: number = 0.0;
  public targetFilterIntensity: number = 0.0;
  public bloomStrength: number = 1.0;
  public isMirrored: boolean = true;
  public cameraZoom: number = 1.0;

  constructor(private canvas: HTMLCanvasElement) {
    this.initGL();
  }

  private initGL() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true, // Crucial for MediaRecorder stream capture
    });

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    // Compile shaders
    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Link error:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;

    // Uniform locations
    this.uTimeLoc = gl.getUniformLocation(program, 'u_time');
    this.uFilterIntensityLoc = gl.getUniformLocation(program, 'u_filterIntensity');
    this.uBloomStrengthLoc = gl.getUniformLocation(program, 'u_bloomStrength');
    this.uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    this.uMirrorLoc = gl.getUniformLocation(program, 'u_mirror');
    this.uCameraZoomLoc = gl.getUniformLocation(program, 'u_cameraZoom');

    // Quad geometry: clip coordinates (-1 to 1) and texture coordinates (0 to 1)
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0,
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    // Setup Video Texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public render(
    video: HTMLVideoElement,
    timeSec: number,
    deltaSec: number,
    hasPose: boolean
  ) {
    const gl = this.gl;
    if (!gl || !this.program || !this.texture || video.readyState < 2) return;

    // 0.3s lerp transition
    this.targetFilterIntensity = hasPose ? 1.0 : 0.0;
    const lerpSpeed = 1.0 - Math.exp(-deltaSec / 0.12); // ~0.3s transition to 95%
    this.currentFilterIntensity += (this.targetFilterIntensity - this.currentFilterIntensity) * lerpSpeed;

    if (Math.abs(this.currentFilterIntensity - this.targetFilterIntensity) < 0.002) {
      this.currentFilterIntensity = this.targetFilterIntensity;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    // Update texture with video frame
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Set uniforms
    if (this.uTimeLoc) gl.uniform1f(this.uTimeLoc, timeSec);
    if (this.uFilterIntensityLoc) gl.uniform1f(this.uFilterIntensityLoc, this.currentFilterIntensity);
    if (this.uBloomStrengthLoc) gl.uniform1f(this.uBloomStrengthLoc, this.bloomStrength);
    if (this.uResolutionLoc) gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    if (this.uMirrorLoc) gl.uniform1i(this.uMirrorLoc, this.isMirrored ? 1 : 0);
    if (this.uCameraZoomLoc) gl.uniform1f(this.uCameraZoomLoc, this.cameraZoom);

    // Bind vertex buffers
    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw full-screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy() {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.program) gl.deleteProgram(this.program);
  }
}
