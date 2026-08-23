import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Quantum Nebula — partim.lol arka plan sahnesi.
 *
 * Orijinal referans bileşen her karede parçacık başına yeni THREE.Vector3 üretiyordu;
 * 50.000 parçacıkta bu saniyede ~3 milyon nesne demek ve arayüzü kilitliyor. Burada
 * simülasyon aynı görsel dille korunup tipik hâline getirildi:
 *   - tüm matematik düz Float32Array üzerinde, karede sıfır tahsis,
 *   - parçacık sayısı ekran/cihaz gücüne göre uyarlanıyor,
 *   - sekme arkaplandayken ve `prefers-reduced-motion` açıkken döngü duruyor,
 *   - kapanışta renderer/composer/geometri/materyal eksiksiz bırakılıyor.
 */

const config = {
  particles: {
    /** Masaüstü hedefi; küçük ekranlarda otomatik düşürülür. */
    count: 20000,
    size: 0.02,
    boxSize: 5,
  },
  colors: {
    /** İki tonlu bulut: turkuaz çekirdek + mor saçaklar */
    baseHue: 188,
    hueVariance: 90,
    saturation: 0.85,
    lightness: 0.58,
  },
  simulation: {
    noiseSpeed: 0.1,
    noiseScale: 1.2,
    mouseRepulsion: 0.02,
    mouseRadius: 1.8,
    friction: 0.94,
    drift: 0.0016,
  },
  bloom: { strength: 0.62, radius: 0.45, threshold: 0.12 },
  camera: { initialDistance: 5, parallaxIntensity: 0.6 },
};

export type QuantumNebulaProps = {
  className?: string;
  /** Parçacık sayısı çarpanı (0–1). Yoğun arayüzlerde düşürülebilir. */
  intensity?: number;
};

export function QuantumNebula({ className, intensity = 1 }: QuantumNebulaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = () => mount.clientWidth || window.innerWidth;
    const height = () => mount.clientHeight || window.innerHeight;

    // WebGL yoksa sessizce vazgeç; sayfanın kendi arka planı yeterli.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width(), height());
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width() / height(), 0.1, 1000);
    camera.position.z = config.camera.initialDistance;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width(), height()),
      config.bloom.strength,
      config.bloom.radius,
      config.bloom.threshold,
    );
    composer.addPass(bloom);
    composer.setSize(width(), height());

    /* ---------------- parçacıklar ---------------- */

    // Küçük ekranlarda ve zayıf cihazlarda sayıyı düşür.
    const areaScale = Math.min(1, (width() * height()) / (1600 * 900));
    const particleCount = Math.max(
      2500,
      Math.round(config.particles.count * intensity * (0.45 + 0.55 * areaScale)),
    );

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const color = new THREE.Color();
    const half = config.particles.boxSize / 2;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Merkeze doğru yoğunlaşan bir bulut: küpü küp kökle bükerek
      const bias = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
      positions[i3] = bias((Math.random() - 0.5) * 2) * half;
      positions[i3 + 1] = bias((Math.random() - 0.5) * 2) * half * 0.75;
      positions[i3 + 2] = bias((Math.random() - 0.5) * 2) * half;

      const hue = (config.colors.baseHue + (Math.random() - 0.5) * config.colors.hueVariance) / 360;
      color.setHSL(
        (hue + 1) % 1,
        config.colors.saturation,
        config.colors.lightness * (0.55 + Math.random() * 0.65),
      );
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), config.particles.boxSize);

    const material = new THREE.ShaderMaterial({
      uniforms: { u_pointSize: { value: config.particles.size * pixelRatio } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        uniform float u_pointSize;

        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = u_pointSize * (900.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          // Yumuşak kenarlı yuvarlak parçacık
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          float strength = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, strength);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    /* ---------------- döngü ---------------- */

    const clock = new THREE.Clock();
    const mouse = { x: 0, y: 0 };
    let frameId = 0;
    let running = true;

    const { noiseScale, noiseSpeed, friction, drift, mouseRepulsion, mouseRadius } = config.simulation;
    const radiusSq = mouseRadius * mouseRadius;

    const step = () => {
      const t = clock.getElapsedTime() * noiseSpeed;
      const mx = mouse.x * half;
      const my = mouse.y * half * 0.75;

      // Tahsissiz sözde-curl alanı: sinüs/kosinüs üçlüsü divergence'ı düşük,
      // organik bir burgu üretir ve parçacık başına sabit maliyetlidir.
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const px = positions[i3];
        const py = positions[i3 + 1];
        const pz = positions[i3 + 2];

        const fx = Math.sin(py * noiseScale + t) * drift;
        const fy = Math.cos(pz * noiseScale + t * 1.13) * drift;
        const fz = Math.sin(px * noiseScale + t * 0.87) * drift;

        let rx = 0;
        let ry = 0;
        const dx = px - mx;
        const dy = py - my;
        const distSq = dx * dx + dy * dy + pz * pz;
        if (distSq < radiusSq) {
          const inv = mouseRepulsion / (distSq + 0.25);
          rx = dx * inv;
          ry = dy * inv;
        }

        let vx = (velocities[i3] + fx + rx) * friction;
        let vy = (velocities[i3 + 1] + fy + ry) * friction;
        let vz = (velocities[i3 + 2] + fz) * friction;

        let nx = px + vx;
        let ny = py + vy;
        let nz = pz + vz;

        // Kutudan çıkan parçacık karşı yüzden geri girer (sarma)
        if (nx > half) nx -= config.particles.boxSize;
        else if (nx < -half) nx += config.particles.boxSize;
        const halfY = half * 0.85;
        if (ny > halfY) ny -= halfY * 2;
        else if (ny < -halfY) ny += halfY * 2;
        if (nz > half) nz -= config.particles.boxSize;
        else if (nz < -half) nz += config.particles.boxSize;

        positions[i3] = nx;
        positions[i3 + 1] = ny;
        positions[i3 + 2] = nz;
        velocities[i3] = vx;
        velocities[i3 + 1] = vy;
        velocities[i3 + 2] = vz;
      }

      positionAttribute.needsUpdate = true;

      camera.position.x += (mouse.x * config.camera.parallaxIntensity - camera.position.x) * 0.03;
      camera.position.y += (mouse.y * config.camera.parallaxIntensity * 0.6 - camera.position.y) * 0.03;
      camera.lookAt(scene.position);
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!running) return;
      step();
      composer.render();
    };

    if (reduceMotion) {
      // Hareket azaltma açıkken tek kare çiz ve dur.
      composer.render();
    } else {
      animate();
    }

    /* ---------------- olaylar ---------------- */

    const handleResize = () => {
      const w = width();
      const h = height();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      if (reduceMotion) composer.render();
    };

    const handlePointer = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    const handleVisibility = () => {
      running = !document.hidden && !reduceMotion;
      if (running) clock.getDelta();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(mount);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [intensity]);

  return <div ref={mountRef} className={className ?? "absolute inset-0 h-full w-full"} aria-hidden="true" />;
}

export default QuantumNebula;
