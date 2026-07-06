"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Hero Animations
    gsap.from(".hero-element", {
      y: 40,
      opacity: 0,
      duration: 1.2,
      stagger: 0.2,
      ease: "power4.out",
      delay: 0.2,
    });

    // Strategy / Bento Grid animations
    gsap.utils.toArray(".bento-item").forEach((item: any, i) => {
      gsap.from(item, {
        scrollTrigger: {
          trigger: item,
          start: "top 85%",
        },
        y: 50,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
      });
    });

    // Research Specs animations
    gsap.from(".tech-spec-item", {
      scrollTrigger: {
        trigger: ".tech-specs",
        start: "top 75%",
      },
      x: -50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: "power3.out",
    });

    // Parallax image
    gsap.to(".parallax-img", {
      scrollTrigger: {
        trigger: ".tech-specs",
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
      y: 100,
      ease: "none",
    });
  }, { scope: container });

  useEffect(() => {
    // Inject the Orbitron and Inter fonts
    const link1 = document.createElement("link");
    link1.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@100;300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
    link1.rel = "stylesheet";
    document.head.appendChild(link1);

    const style = document.createElement("style");
    style.innerHTML = `
      .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      }
      .sonar-sweep {
          background: linear-gradient(to bottom, transparent, #a1faff22, transparent);
          height: 100px;
          width: 100%;
          position: absolute;
          top: -100px;
          left: 0;
          pointer-events: none;
          z-index: 10;
          animation: scan 8s linear infinite;
      }
      .glow-text { text-shadow: 0 0 15px rgba(161, 250, 255, 0.4); }
      .glass-panel { backdrop-filter: blur(20px); background: rgba(21, 39, 57, 0.4); }
      .bracket-tl { border-top: 2px solid #a1faff; border-left: 2px solid #a1faff; width: 12px; height: 12px; position: absolute; top: 0; left: 0; }
      .bracket-tr { border-top: 2px solid #a1faff; border-right: 2px solid #a1faff; width: 12px; height: 12px; position: absolute; top: 0; right: 0; }
      .bracket-bl { border-bottom: 2px solid #a1faff; border-left: 2px solid #a1faff; width: 12px; height: 12px; position: absolute; bottom: 0; left: 0; }
      .bracket-br { border-bottom: 2px solid #a1faff; border-right: 2px solid #a1faff; width: 12px; height: 12px; position: absolute; bottom: 0; right: 0; }
      @keyframes scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(1000%); } }
      .font-headline { font-family: 'Orbitron', sans-serif; }
      .font-technical { font-family: 'Space Grotesk', sans-serif; }
      .font-body { font-family: 'Inter', sans-serif; }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link1);
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="bg-[#040f1b] text-[#dde9fb] font-body min-h-screen selection:bg-[#a1faff]/30 selection:text-[#a1faff]">
      {/* Top Navigation Shell */}
      <header className="bg-[#040f1b]/80 backdrop-blur-xl fixed top-0 w-full z-50 border-b border-[#a1faff]/10 flex justify-between items-center px-8 h-20 max-w-full mx-auto shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#a1faff] text-3xl">waves</span>
          <h1 className="text-2xl font-bold tracking-tighter text-[#a1faff] drop-shadow-[0_0_8px_rgba(161,250,255,0.6)] font-headline tracking-widest uppercase">
            ABYSSAL NAVIGATOR
          </h1>
        </div>
        <nav className="hidden md:flex gap-8">
          <a className="text-[#a1faff] hover:text-[#00e5ee] transition-colors font-headline text-xs tracking-widest cursor-pointer" onClick={(e) => { e.preventDefault(); document.querySelector('#mission')?.scrollIntoView({ behavior: 'smooth' }); }}>MISSION</a>
          <a className="text-[#64b3ff] hover:text-[#a1faff] transition-colors font-headline text-xs tracking-widest cursor-pointer" onClick={(e) => { e.preventDefault(); document.querySelector('#technology')?.scrollIntoView({ behavior: 'smooth' }); }}>TECHNOLOGY</a>
          <a className="text-[#64b3ff] hover:text-[#a1faff] transition-colors font-headline text-xs tracking-widest cursor-pointer" onClick={(e) => { e.preventDefault(); document.querySelector('#research')?.scrollIntoView({ behavior: 'smooth' }); }}>RESEARCH</a>
        </nav>
        <Link href="/dashboard" className="bg-[#a1faff]/10 border border-[#a1faff]/30 text-[#a1faff] px-6 py-2 font-headline text-xs tracking-[0.2em] hover:bg-[#a1faff]/20 transition-all duration-300">
          DASHBOARD
        </Link>
      </header>

      <main ref={container} className="relative pt-20 overflow-hidden">
        {/* Background Atmospheric Element */}
        <div className="fixed inset-0 pointer-events-none opacity-20 overflow-hidden">
          <div className="sonar-sweep"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#152739_0%,_transparent_70%)]"></div>
        </div>

        {/* Hero Section */}
        <section id="mission" className="relative min-h-[85vh] flex flex-col items-center justify-center px-6 text-center z-10">
          <div className="max-w-5xl space-y-8">
            <div className="hero-element inline-flex items-center gap-2 px-3 py-1 bg-[#a1faff]/5 border border-[#a1faff]/20 text-[#a1faff] text-[10px] tracking-[0.3em] font-headline uppercase mb-4">
              <span className="material-symbols-outlined text-[14px]">security</span>
              SRM INSTITUTE TACTICAL UNIT
            </div>
            <h1 className="hero-element text-6xl md:text-8xl lg:text-9xl font-headline font-black tracking-tighter leading-none glow-text">
              ABYSSAL<br />
              <span className="text-[#00e5ee]">NAVIGATOR</span>
            </h1>
            <p className="hero-element text-xl md:text-2xl text-[#64b3ff] font-headline tracking-[0.1em] uppercase max-w-3xl mx-auto">
              Autonomous Target Detection for Deep-Sea Rescue Operations
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-left mt-12 items-center">
              <div className="space-y-6">
                <p className="hero-element text-[#dde9fb]/80 leading-relaxed font-light text-lg">
                  The ocean depths are the final frontier of rescue logistics. Where optical cameras fail in the crushing dark, our acoustic AI illuminates the abyss. Powered by the <span className="text-[#a1faff]">UATD dataset</span>, Abyssal Navigator detects human remains and wreckage with pinpoint tactical precision.
                </p>
                <div className="hero-element flex flex-wrap gap-4">
                  <Link href="/dashboard" className="group relative px-10 py-5 bg-gradient-to-r from-[#a1faff] to-[#00f4fe] text-[#00575b] font-headline font-bold text-sm tracking-[0.2em] transition-transform active:scale-95 shadow-[0_0_20px_rgba(161,250,255,0.3)] hover:shadow-[0_0_35px_rgba(161,250,255,0.6)]">
                    LAUNCH MISSION DASHBOARD
                  </Link>
                  <button onClick={() => document.querySelector('#research')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-5 border border-[#3d4957] text-[#dde9fb] font-headline text-sm tracking-[0.2em] hover:bg-[#102131] transition-colors cursor-pointer">
                    VIEW DATASET
                  </button>
                </div>
              </div>
              <div className="relative group p-6 hero-element">
                <div className="bracket-tl"></div><div className="bracket-tr"></div><div className="bracket-bl"></div><div className="bracket-br"></div>
                <div className="p-4 bg-[#0b1b2a] border border-[#a1faff]/10">
                  <img alt="Sonar Tactical" className="w-full h-64 object-cover grayscale brightness-75 contrast-125 group-hover:grayscale-0 transition-all duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3aAYWyWa-_TflhJWZr0NgzMkXFK8dMndPF1ZUpI-1mESbILNFuDU50Izns-LsKEmMB8WaH2fos0aUVRvQ1krW6pqRScB2Ov_FgjwrA3gvrr0wfa8ZB413EjfQWfCBxznJ_GvPk2_bgCSgpzwh9aXpeL1xSfE76nY_cB9e8IzQVGBSNufzHWWF2Bv33B5SNPxmQwMSM_qs-ALLcnwp1iHDTtjt7svjoFCOVL03KZIHm-VB79Zdd0PJP71Zn39yJqfvKUWGgQi20zc" />
                  <div className="mt-4 flex justify-between items-center font-technical text-[10px] tracking-widest text-[#a1faff]/60 uppercase">
                    <span>DEPTH: 4,500M</span>
                    <span>SONAR_LINK: ACTIVE</span>
                    <span>LAT: 12.8231° N</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section id="technology" className="py-32 px-8 max-w-7xl mx-auto relative z-10">
          <div className="mb-20 space-y-4">
            <h2 className="text-4xl font-headline font-bold text-[#dde9fb] tracking-widest uppercase">TACTICAL ARCHITECTURE</h2>
            <div className="h-1 w-24 bg-[#a1faff]"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bento-grid">
            <div className="bento-item md:col-span-8 group relative bg-[#061422] p-8 border border-[#3d4957]/30 hover:border-[#a1faff]/40 transition-all duration-500 overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-[#a1faff]/10 font-headline text-6xl select-none group-hover:text-[#a1faff]/20 transition-colors">01</div>
              <div className="relative z-10 h-full flex flex-col">
                <span className="material-symbols-outlined text-[#a1faff] text-4xl mb-6">neurology</span>
                <h3 className="text-2xl font-headline font-bold text-[#dde9fb] mb-4 tracking-tight">YOLOv8l Sonar Optimization</h3>
                <p className="text-[#dde9fb]/60 leading-relaxed mb-8 max-w-xl">
                  Heavily customized YOLOv8 Large architecture specifically trained on acoustic backscatter patterns. Our model ignores sea-floor clutter to identify synthetic materials and biological signatures in low-frequency environments.
                </p>
                <div className="mt-auto pt-4 border-t border-[#3d4957]/50 flex gap-6 text-[10px] font-technical text-[#a1faff]/70 uppercase tracking-widest">
                  <span>Precision: 0.94 mAP</span>
                  <span>Latency: 12ms</span>
                  <span>Layer: Convolutional-S</span>
                </div>
              </div>
            </div>

            <div className="bento-item md:col-span-4 group relative bg-[#102131] p-8 border border-[#3d4957]/30 hover:border-[#a1faff]/40 transition-all duration-500">
              <div className="relative z-10 h-full flex flex-col">
                <span className="material-symbols-outlined text-[#a1faff] text-4xl mb-6">query_stats</span>
                <h3 className="text-xl font-headline font-bold text-[#dde9fb] mb-4 tracking-tight">MC-TTA Engine</h3>
                <p className="text-[#dde9fb]/60 leading-relaxed text-sm">
                  Monte Carlo Test-Time Augmentation quantifies uncertainty in high-pressure environments. If the AI is unsure, the system triggers manual verification pulses.
                </p>
              </div>
            </div>

            <div className="bento-item md:col-span-4 group relative bg-[#102131] p-8 border border-[#3d4957]/30 hover:border-[#a1faff]/40 transition-all duration-500">
              <div className="relative z-10 h-full flex flex-col">
                <span className="material-symbols-outlined text-[#a1faff] text-4xl mb-6">history_toggle_off</span>
                <h3 className="text-xl font-headline font-bold text-[#dde9fb] mb-4 tracking-tight">Real-Time Temporal Tracking</h3>
                <p className="text-[#dde9fb]/60 leading-relaxed text-sm">
                  Continuous frame-to-frame association ensures targets are never lost due to sonar occlusion or underwater turbulence. Multi-object tracking at 60 FPS.
                </p>
              </div>
            </div>

            <div className="bento-item md:col-span-8 group relative bg-[#0b1b2a] p-8 border border-[#3d4957]/30 hover:border-[#a1faff]/40 transition-all duration-500 overflow-hidden">
              <div className="flex flex-col md:flex-row gap-8 h-full">
                <div className="flex-1">
                  <span className="material-symbols-outlined text-[#a1faff] text-4xl mb-6">analytics</span>
                  <h3 className="text-2xl font-headline font-bold text-[#dde9fb] mb-4 tracking-tight">Live Triage & Priority Scoring</h3>
                  <p className="text-[#dde9fb]/60 leading-relaxed mb-6">
                    Dynamic sorting algorithm based on (Eq.3). Categorizes detected objects by rescue viability and historical signature matches.
                  </p>
                  <code className="block bg-black/40 p-4 font-technical text-[10px] sm:text-xs text-[#c9d4f0] border-l-2 border-[#a1faff]">
                    P(x) = ∑ [ω_i * S_i(x)] / Δt²
                  </code>
                </div>
                <div className="w-full md:w-48 bg-[#152739] flex items-center justify-center border border-[#a1faff]/5 hidden sm:flex">
                  <img alt="Data Analysis" className="h-full w-full object-cover mix-blend-lighten opacity-50" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOt-6Pw-6UzQekeuvndF0zytjNrMaDFz3afIa9JFDxBdw94KA6PGaKofmwIw22sxkc2LI3k2l_GskIA3H8l42akxSLDVcz6Dd38AlvRACci3vboK07wSwhUM8d8tD9GBRBwgvv27ql0n-iNv3PoH6a5svmPgnPhsfiVRgeYLbFOvP5ZVDOGv8oEKyuiw5BLUa19AA8BrcAtxJw3cWaKmyOWrONqcmJ1s-Tji8yFSBdMqecfzDIECGda0B7NsGA_tMtFOMaX6Sw064" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Technical Specs Section */}
        <section id="research" className="tech-specs py-32 bg-[#061422]/50 overflow-hidden">
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1 relative overflow-hidden rounded-sm">
              <img alt="Submerged Vessel" className="parallax-img w-full aspect-square object-cover grayscale brightness-50 contrast-125 scale-125 origin-center" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDA_BoI9yvLpz3s_6cKD9-vGVAsYg6_KbclPiJASxV2zwSvsrmL_x-242eBHGstP2JBoCPWJbKsoDkP_zTHYhgsj1eNrSIzvzXGDig8EdzG8NOCzZKHJu_w20NzdvplicXvfDBwZkZYv8EdsNhvrXbEV3lqU-WkDIT2qRdn-gYX7Z_qYhBwdeKhNlh1L5KKrOwutV3ZF04ADuA4h-whG3Jx2_hK2TO4tTvcuZwGotW_fqxeH7GPcImk6ZaqocHM00lae4LXCVHsQDE" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040f1b] via-transparent to-transparent"></div>
              <div className="absolute bottom-8 left-8 right-8 p-6 glass-panel border border-[#a1faff]/10">
                <h4 className="font-headline text-[#a1faff] text-sm tracking-[0.3em] mb-2 uppercase">DEPLOYMENT STATUS</h4>
                <div className="flex justify-between items-center font-technical text-xs text-[#dde9fb]/60">
                  <span>FLEET_ID: SRM_NAV_04</span>
                  <span className="flex items-center gap-2"><span className="w-2 h-2 bg-[#a1faff] rounded-full animate-pulse"></span> OPERATIONAL</span>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 space-y-10">
              <h2 className="tech-spec-item text-5xl font-headline font-black leading-tight">PRECISION <br /><span className="text-[#00e5ee]">UNDER PRESSURE</span></h2>
              <p className="tech-spec-item text-[#dde9fb]/70 text-lg leading-relaxed font-light">
                Our research at SRM Institute bridges the gap between theoretical AI and maritime survival. By leveraging high-frequency sonar data, we provide rescue teams with an "Acoustic Eye" that penetrates 6,000 meters of oceanic void.
              </p>
              <ul className="space-y-6">
                <li className="tech-spec-item flex items-start gap-4">
                  <span className="text-[#a1faff] font-headline text-lg mt-1">01/</span>
                  <div>
                    <h5 className="font-headline font-bold text-[#dde9fb] tracking-wide uppercase">Zero-Visibility Mapping</h5>
                    <p className="text-[#dde9fb]/50 text-sm">Synthetic aperture sonar synthesis for high-fidelity terrain mapping.</p>
                  </div>
                </li>
                <li className="tech-spec-item flex items-start gap-4">
                  <span className="text-[#a1faff] font-headline text-lg mt-1">02/</span>
                  <div>
                    <h5 className="font-headline font-bold text-[#dde9fb] tracking-wide uppercase">Edge Compute Optimization</h5>
                    <p className="text-[#dde9fb]/50 text-sm">Optimized inference engines designed for low-power AUV hardware.</p>
                  </div>
                </li>
                <li className="tech-spec-item flex items-start gap-4">
                  <span className="text-[#a1faff] font-headline text-lg mt-1">03/</span>
                  <div>
                    <h5 className="font-headline font-bold text-[#dde9fb] tracking-wide uppercase">Adversarial Hardening</h5>
                    <p className="text-[#dde9fb]/50 text-sm">Resistant to acoustic noise, thermal layers, and biological interference.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Shell */}
      <footer className="bg-[#040f1b] w-full py-12 px-8 border-t border-[#a1faff]/5 flex flex-col md:flex-row justify-between items-center gap-6 z-20 relative">
        <div className="text-[#64b3ff] font-['Inter'] text-[10px] uppercase tracking-[0.2em] font-light">
          © 2026 SRM INSTITUTE | TACTICAL DEEP-SEA INTELLIGENCE
        </div>
        <div className="flex flex-wrap justify-center gap-8">
          <span className="text-[#64b3ff] font-['Inter'] text-[10px] uppercase tracking-[0.2em] font-light hover:text-[#a1faff] cursor-crosshair transition-all duration-500 hover:tracking-[0.3em]">LAT: 12.8231° N</span>
          <span className="text-[#64b3ff] font-['Inter'] text-[10px] uppercase tracking-[0.2em] font-light hover:text-[#a1faff] cursor-crosshair transition-all duration-500 hover:tracking-[0.3em]">LONG: 80.0442° E</span>
          <span className="text-[#64b3ff] font-['Inter'] text-[10px] uppercase tracking-[0.2em] font-light hover:text-[#a1faff] cursor-crosshair transition-all duration-500 hover:tracking-[0.3em]">SONAR_v4.2</span>
          <span className="text-[#a1faff] font-['Inter'] text-[10px] uppercase tracking-[0.2em] font-light cursor-crosshair transition-all duration-500 hover:tracking-[0.3em]">SYSTEM_STATUS: NOMINAL</span>
        </div>
      </footer>
    </div>
  );
}
