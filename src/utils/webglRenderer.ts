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
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_filterIntensity; // 0.0 (clean) to 1.0 (majestic)
  uniform float u_bloomScale;      // pre-scaled bloom factor
  uniform vec2 u_step1;            // inner ring UV step (texelSize * r1)
  uniform vec2 u_step2;            // outer ring UV step (texelSize * r2)
  uniform bool u_mirror;
  uniform float u_invZoom;         // 1.0 / effectiveZoom

  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  const vec3 GOLDEN_HALATION = vec3(1.22, 1.02, 0.72);
  const vec4 BORDER_COLOR = vec4(0.04, 0.04, 0.06, 1.0);

  vec3 tapInner(vec2 uv, vec2 dir) {
    vec3 c = texture2D(u_texture, clamp(uv + dir * u_step1, 0.0, 1.0)).rgb;
    return c * smoothstep(0.60, 0.95, dot(c, LUMA));
  }

  vec3 tapOuter(vec2 uv, vec2 dir) {
    vec3 c = texture2D(u_texture, clamp(uv + dir * u_step2, 0.0, 1.0)).rgb;
    return c * smoothstep(0.68, 1.0, dot(c, LUMA));
  }

  void main() {
    vec2 coord = v_texCoord;
    if (u_mirror) {
      coord.x = 1.0 - coord.x;
    }

    vec2 centeredUv = (coord - 0.5) * u_invZoom + 0.5;

    // Early exit for zoomed-out border pixels before any texture lookups
    if (centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
      gl_FragColor = BORDER_COLOR;
      return;
    }

    // Single center sample reused for fast path, green channel, and final blend
    vec3 original = texture2D(u_texture, centeredUv).rgb;

    // Fast path: if filter is completely off, render crisp original immediately
    if (u_filterIntensity <= 0.001) {
      gl_FragColor = vec4(original, 1.0);
      return;
    }

    vec2 distVec = centeredUv - 0.5;
    float dist = length(distVec);

    // 1. Subtle Chromatic Aberration (RGB shift, reuse center green channel)
    float aberration = 0.0055 * u_filterIntensity * (0.6 + 0.8 * dist);
    vec3 baseColor = original;
    if (aberration > 0.0002) {
      vec2 shift = distVec * aberration;
      baseColor.r = texture2D(u_texture, clamp(centeredUv + shift, 0.0, 1.0)).r;
      baseColor.b = texture2D(u_texture, clamp(centeredUv - shift, 0.0, 1.0)).b;
    }

    // 2. High-pass Luminance & Diffusion Bloom (precomputed unit ring directions, zero per-pixel trig)
    vec3 ring1 =
      tapInner(centeredUv, vec2( 1.0,         0.0)) +
      tapInner(centeredUv, vec2( 0.70710678,  0.70710678)) +
      tapInner(centeredUv, vec2( 0.0,         1.0)) +
      tapInner(centeredUv, vec2(-0.70710678,  0.70710678)) +
      tapInner(centeredUv, vec2(-1.0,         0.0)) +
      tapInner(centeredUv, vec2(-0.70710678, -0.70710678)) +
      tapInner(centeredUv, vec2( 0.0,        -1.0)) +
      tapInner(centeredUv, vec2( 0.70710678, -0.70710678));

    vec3 ring2 =
      tapOuter(centeredUv, vec2( 0.92387953,  0.38268343)) +
      tapOuter(centeredUv, vec2( 0.38268343,  0.92387953)) +
      tapOuter(centeredUv, vec2(-0.38268343,  0.92387953)) +
      tapOuter(centeredUv, vec2(-0.92387953,  0.38268343)) +
      tapOuter(centeredUv, vec2(-0.92387953, -0.38268343)) +
      tapOuter(centeredUv, vec2(-0.38268343, -0.92387953)) +
      tapOuter(centeredUv, vec2( 0.38268343, -0.92387953)) +
      tapOuter(centeredUv, vec2( 0.92387953, -0.38268343));

    vec3 bloom = (ring1 * 1.3 + ring2 * 0.8) * GOLDEN_HALATION * u_bloomScale;

    // 3. Exposure & Contrast Boost with Lifted Matte Blacks
    vec3 contrasted = (baseColor - 0.5) * (1.0 + 0.32 * u_filterIntensity) + 0.5;
    vec3 liftedBlacks = vec3(0.045, 0.038, 0.03) * u_filterIntensity;
    contrasted = max(contrasted, liftedBlacks);

    vec3 warmShift = vec3(1.05, 1.02, 0.96);
    contrasted *= mix(vec3(1.0), warmShift, u_filterIntensity * 0.7);
    contrasted *= (1.0 + 0.18 * u_filterIntensity);

    // 4. Combine base + bloom glow (Screen blend)
    vec3 combined = 1.0 - (1.0 - contrasted) * (1.0 - clamp(bloom * u_filterIntensity, 0.0, 0.95));

    // 5. Soft Vignette towards frame edges
    float vignette = 1.0 - smoothstep(0.55, 1.35, dist * 1.35);
    combined *= mix(1.0, vignette, 0.45 * u_filterIntensity);

    // 6. Subtle ethereal shimmer sparkle
    float shimmer = sin(centeredUv.y * 320.0 + u_time * 5.0) * cos(centeredUv.x * 320.0 + u_time * 4.0) * 0.015;
    combined += vec3(shimmer * u_filterIntensity);

    // Final smooth blend between clean feed and majestic grade
    vec3 finalOut = mix(original, combined, u_filterIntensity);
    gl_FragColor = vec4(clamp(finalOut, 0.0, 1.0), 1.0);
  }
`;

const QUAD_POSITIONS = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]);

const QUAD_TEX_COORDS = new Float32Array([
  0, 1,
  1, 1,
  0, 0,
  0, 0,
  1, 1,
  1, 0,
]);

export class WebGLFilterPipeline {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  private uTimeLoc: WebGLUniformLocation | null = null;
  private uFilterIntensityLoc: WebGLUniformLocation | null = null;
  private uBloomScaleLoc: WebGLUniformLocation | null = null;
  private uStep1Loc: WebGLUniformLocation | null = null;
  private uStep2Loc: WebGLUniformLocation | null = null;
  private uMirrorLoc: WebGLUniformLocation | null = null;
  private uInvZoomLoc: WebGLUniformLocation | null = null;

  public currentFilterIntensity: number = 0.0;
  public targetFilterIntensity: number = 0.0;
  public bloomStrength: number = 1.0;
  public isMirrored: boolean = true;
  public cameraZoom: number = 1.0;

  private isContextLost: boolean = false;
  private lastViewportWidth: number = 0;
  private lastViewportHeight: number = 0;
  private lastVideoTime: number = -1;
  private lastTexWidth: number = 0;
  private lastTexHeight: number = 0;
  private lastDrawnIntensity: number = -1;
  private lastDrawnMirror: boolean | null = null;
  private lastDrawnZoom: number = -1;

  private readonly handleContextLost: (e: Event) => void;
  private readonly handleContextRestored: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('⚡ [WebGLFilterPipeline] WebGL Context Lost! Awaiting restoration...');
      this.isContextLost = true;
    };

    this.handleContextRestored = () => {
      console.log('✨ [WebGLFilterPipeline] WebGL Context Restored! Reinitializing shaders...');
      this.isContextLost = false;
      this.resetRenderCache();
      this.initGL();
    };

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.initGL();
  }

  private resetRenderCache() {
    this.lastViewportWidth = 0;
    this.lastViewportHeight = 0;
    this.lastVideoTime = -1;
    this.lastTexWidth = 0;
    this.lastTexHeight = 0;
    this.lastDrawnIntensity = -1;
    this.lastDrawnMirror = null;
    this.lastDrawnZoom = -1;
  }

  private initGL() {
    const gl = (this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true, // Crucial for MediaRecorder stream capture
      powerPreference: 'high-performance',
    }) || this.canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    // Shaders can be freed once linked into the program
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    this.program = program;
    gl.useProgram(program);

    // Cache uniform locations once
    this.uTimeLoc = gl.getUniformLocation(program, 'u_time');
    this.uFilterIntensityLoc = gl.getUniformLocation(program, 'u_filterIntensity');
    this.uBloomScaleLoc = gl.getUniformLocation(program, 'u_bloomScale');
    this.uStep1Loc = gl.getUniformLocation(program, 'u_step1');
    this.uStep2Loc = gl.getUniformLocation(program, 'u_step2');
    this.uMirrorLoc = gl.getUniformLocation(program, 'u_mirror');
    this.uInvZoomLoc = gl.getUniformLocation(program, 'u_invZoom');

    // Bind static full-screen quad geometry and vertex attributes once
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_TEX_COORDS, gl.STATIC_DRAW);

    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    if (texLoc >= 0) {
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
    }

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
    if (!gl || this.isContextLost || !this.program || !this.texture) return;
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (video.readyState < 2 || vW === 0 || vH === 0) return;

    try {
      // Smooth ~0.3s lerp transition
      this.targetFilterIntensity = hasPose ? 1.0 : 0.0;
      const lerpSpeed = 1.0 - Math.exp(-deltaSec / 0.12);
      this.currentFilterIntensity += (this.targetFilterIntensity - this.currentFilterIntensity) * lerpSpeed;

      if (Math.abs(this.currentFilterIntensity - this.targetFilterIntensity) < 0.002) {
        this.currentFilterIntensity = this.targetFilterIntensity;
      }

      const cW = this.canvas.width;
      const cH = this.canvas.height;
      const viewportChanged = cW !== this.lastViewportWidth || cH !== this.lastViewportHeight;
      const vt = video.currentTime;
      const isNewVideoFrame =
        vt <= 0 ||
        vt !== this.lastVideoTime ||
        vW !== this.lastTexWidth ||
        vH !== this.lastTexHeight;

      // Skip redundant GPU draw when clean feed is static and camera hasn't produced a new frame
      if (
        !isNewVideoFrame &&
        !viewportChanged &&
        this.currentFilterIntensity === 0 &&
        this.lastDrawnIntensity === 0 &&
        this.isMirrored === this.lastDrawnMirror &&
        this.cameraZoom === this.lastDrawnZoom
      ) {
        return;
      }

      if (viewportChanged) {
        gl.viewport(0, 0, cW, cH);
        this.lastViewportWidth = cW;
        this.lastViewportHeight = cH;
      }

      // Upload video texture only when a new frame has arrived
      if (isNewVideoFrame) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        this.lastVideoTime = vt;
        this.lastTexWidth = vW;
        this.lastTexHeight = vH;
      }

      // Precompute frame-level constants once on CPU instead of per-fragment on GPU
      const intensity = this.currentFilterIntensity;
      const pulse = intensity > 0.001 ? Math.sin(timeSec * 2.2) * 0.015 : 0.0;
      const effectiveZoom = Math.max(0.1, this.cameraZoom + 0.02 * pulse * intensity);

      if (this.uFilterIntensityLoc) gl.uniform1f(this.uFilterIntensityLoc, intensity);
      if (this.uMirrorLoc) gl.uniform1i(this.uMirrorLoc, this.isMirrored ? 1 : 0);
      if (this.uInvZoomLoc) gl.uniform1f(this.uInvZoomLoc, 1.0 / effectiveZoom);

      if (intensity > 0.001) {
        const invW = 1.0 / cW;
        const invH = 1.0 / cH;
        const r1 = 3.5 * (1.0 + 0.25 * Math.sin(timeSec * 1.5));
        const r2 = 7.5;
        // (1 / 14.4 totalWeight) * 1.45 = 0.10069444
        const bloomScale = this.bloomStrength * 0.10069444;

        if (this.uTimeLoc) gl.uniform1f(this.uTimeLoc, timeSec);
        if (this.uBloomScaleLoc) gl.uniform1f(this.uBloomScaleLoc, bloomScale);
        if (this.uStep1Loc) gl.uniform2f(this.uStep1Loc, invW * r1, invH * r1);
        if (this.uStep2Loc) gl.uniform2f(this.uStep2Loc, invW * r2, invH * r2);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      this.lastDrawnIntensity = intensity;
      this.lastDrawnMirror = this.isMirrored;
      this.lastDrawnZoom = this.cameraZoom;
    } catch (err) {
      // Catch transient iOS video frame read error without terminating the render loop
      console.warn('WebGL render error on frame:', err);
    }
  }

  public destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);

    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.program) gl.deleteProgram(this.program);

    this.texture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.program = null;
    this.gl = null;
  }
}
