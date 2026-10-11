import { useEffect, useRef } from 'react';

// Original procedural cloud field. No images, network calls, or animation dependencies.
const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p){
 float v=0.; float a=.5;
 for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;a*=.5;}
 return v;
}
void main(){
 vec2 uv=gl_FragCoord.xy/resolution;
 float aspect=resolution.x/resolution.y;
 vec2 p=vec2(uv.x*aspect,uv.y);
 vec3 sky=mix(vec3(.85,.92,.95),vec3(.37,.65,.82),pow(uv.y,.7));
 sky+=vec3(.055,.04,.015)*pow(max(0.,1.-length(uv-vec2(.76,.76))),4.);
 // Separate billowing banks keep the central wordmark in open sky.
 for(int i=0;i<3;i++){
  float layer=float(i);
  vec2 q=p*vec2(3.1+layer*.7,3.8)+vec2(time*(.025+layer*.008)+layer*13.,layer*4.);
  float n=fbm(q);
  float detail=fbm(q*2.3+4.);
  float ridge=.16+layer*.105 + .17*sin(p.x*3.1+layer*2.5)+.11*sin(p.x*6.7+layer);
  float mass=(ridge-uv.y)*1.7+n*.58+detail*.13;
  float density=smoothstep(.18,.37,mass);
  float light=fbm(q+vec2(-.12,.17));
  vec3 shade=mix(vec3(.57,.71,.80),vec3(1.,.985,.955),smoothstep(.21,.61,light+uv.y*.3));
  shade=mix(shade,vec3(1.,.99,.965),(1.-smoothstep(.21,.36,mass))*.55);
  sky=mix(sky,shade,density*(.68+layer*.13));
 }
 sky+= (hash(gl_FragCoord.xy)-.5)*.003;
 gl_FragColor=vec4(sky,1.);
}`;

export function CloudSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!vs || !fs || !program) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); if (program) gl.deleteProgram(program); return; }
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const res = gl.getUniformLocation(program, 'resolution'), clock = gl.getUniformLocation(program, 'time');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true, lost = false, raf = 0, elapsed = 0, previous = 0, dirty = true;
    const resize = () => {
      const scale = Math.min(1, 1200 / Math.max(1, canvas.clientWidth));
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0,0,canvas.width,canvas.height); dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    intersection.observe(canvas);
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; canvas.style.opacity = '0'; };
    canvas.addEventListener('webglcontextlost', contextLost);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - previous < 33) return;
      const delta = Math.min(now - previous, 100); previous = now;
      const animate = visible && !document.hidden && !motion.matches;
      if (lost || (!dirty && !animate)) return;
      if (animate) elapsed += delta / 1000;
      gl.uniform2f(res, canvas.width, canvas.height); gl.uniform1f(clock, elapsed);
      gl.drawArrays(gl.TRIANGLES,0,6); canvas.style.opacity = '1'; dirty = false;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    };
  }, []);
  return <div className="wl-sky" aria-hidden="true"><div className="wl-sky-fallback" /><canvas ref={ref} /></div>;
}
