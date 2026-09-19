"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { namehash, shortHex } from "@/lib/namespace";
import type { CarouselItem } from "@/lib/viewModel";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const easeOutPower3 = (t: number) => 1 - Math.pow(1 - t, 3);

type Tween = { kill: () => void };

/** A one-value tween on requestAnimationFrame; enough to replace GSAP here. */
function tween(from: number, to: number, durationMs: number, onUpdate: (v: number) => void, onComplete?: () => void): Tween {
  let raf = 0;
  let killed = false;
  if (durationMs <= 0) {
    onUpdate(to);
    onComplete?.();
    return { kill: () => {} };
  }
  const start = performance.now();
  const step = (now: number) => {
    if (killed) return;
    const t = clamp((now - start) / durationMs, 0, 1);
    onUpdate(from + (to - from) * easeOutPower3(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else onComplete?.();
  };
  raf = requestAnimationFrame(step);
  return {
    kill: () => {
      killed = true;
      cancelAnimationFrame(raf);
    },
  };
}

type Props = {
  items: CarouselItem[];
  cardWidth?: number;
  cardHeight?: number;
  radius?: number;
  tint?: string;
  depth?: number;
  spread?: number;
  tilt?: number;
  tiltDirection?: "left" | "right";
  perspective?: number;
  visibleCards?: number;
  falloff?: number;
  blur?: number;
  duration?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  showControls?: boolean;
  showIndicators?: boolean;
  onChange?: (index: number, item: CarouselItem) => void;
  className?: string;
};

function nodePreview(name: string): string {
  try {
    return shortHex(namehash(name), 6, 4);
  } catch {
    return "0x…";
  }
}

/**
 * A stack of identity cards in perspective: drag, wheel, arrows, dots and
 * keyboard move through them; the front card tilts under the pointer.
 */
export function DepthCarousel({
  items,
  cardWidth = 370,
  cardHeight = 480,
  radius = 20,
  tint = "#07060a",
  depth = 240,
  spread = 95,
  tilt = 20,
  tiltDirection = "right",
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 5,
  duration = 700,
  autoplay = false,
  autoplayDelay = 3200,
  loop = true,
  showControls = true,
  showIndicators = true,
  onChange,
  className = "",
}: Props) {
  const list = useMemo(() => items.map((it) => ({ alt: "", ...it })), [items]);
  const count = list.length;
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const tints = useRef<(HTMLSpanElement | null)[]>([]);
  const pos = useRef(0);
  const target = useRef(0);
  const anim = useRef<Tween | null>(null);
  const scale = useRef(1);
  const cfg = useRef({ count, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, loop, cardWidth, autoplayDelay });
  const onChangeRef = useRef(onChange);
  const drag = useRef<{ x: number; startPos: number; lastX: number; lastT: number; v: number; moved: boolean; id: number } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = useRef(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    cfg.current = { count, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, loop, cardWidth, autoplayDelay };
    onChangeRef.current = onChange;
  });

  const layout = useCallback((p: number) => {
    const c = cfg.current;
    const n = c.count;
    if (!n) return;
    const dir = c.tiltDirection === "left" ? -1 : 1;
    const s = scale.current;
    for (let i = 0; i < n; i++) {
      const el = cards.current[i];
      if (!el) continue;
      let off = i - p;
      if (c.loop && n > 1) {
        off = ((off % n) + n) % n;
        if (off > n / 2) off -= n;
      }
      const back = Math.max(0, off);
      const visible = Math.abs(off) <= c.visibleCards + 0.5;
      const z = -c.depth * off;
      const x = dir * c.spread * off;
      const ry = dir * c.tilt * clamp(off, 0, 1);
      let opacity = off < 0 ? Math.max(0, 1 + off) : 1;
      if (!visible) opacity = 0;
      const brightness = Math.max(0.15, 1 - back * c.falloff);
      const blurPx = c.blur > 0 ? Math.min(c.blur, (back / Math.max(1, c.visibleCards)) * c.blur) : 0;
      el.style.transform = `translate(-50%, -50%) scale(${s}) translateX(${x.toFixed(2)}px) translateZ(${z.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`;
      el.style.zIndex = String(Math.round(2000 - off * 20));
      el.style.pointerEvents = visible && opacity > 0.05 ? "auto" : "none";
      const t = tints.current[i];
      if (t) t.style.opacity = clamp(back * c.falloff * 1.25, 0, 0.86).toFixed(3);
    }
  }, []);

  const announce = useCallback(
    (index: number) => {
      setActive(index);
      onChangeRef.current?.(index, list[index]);
    },
    [list],
  );

  const animateTo = useCallback(
    (p: number, animated: boolean) => {
      anim.current?.kill();
      const c = cfg.current;
      const ms = animated && !reduced.current ? c.duration : 0;
      anim.current = tween(
        pos.current,
        p,
        ms,
        (v) => {
          pos.current = v;
          layout(v);
        },
        () => {
          const n = c.count;
          if (n > 0) pos.current = ((pos.current % n) + n) % n;
          layout(pos.current);
        },
      );
    },
    [layout],
  );

  const goTo = useCallback(
    (index: number, animated = true) => {
      const c = cfg.current;
      const n = c.count;
      if (!n) return;
      const next = c.loop ? ((index % n) + n) % n : clamp(index, 0, n - 1);
      let delta = next - pos.current;
      if (c.loop && n > 1) {
        delta = ((delta % n) + n) % n;
        if (delta > n / 2) delta -= n;
      }
      animateTo(pos.current + delta, animated);
      if (next !== target.current) {
        target.current = next;
        announce(next);
      }
    },
    [animateTo, announce],
  );

  const step = useCallback((d: number) => goTo(target.current + d, true), [goTo]);

  // Fit the stack to the container: measure now (a hidden pane never fires
  // ResizeObserver), then keep following the container.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = (width: number) => {
      const c = cfg.current;
      const need = Math.max(c.cardWidth, c.cardWidth + Math.abs(c.spread) * 0.9);
      scale.current = clamp(width / need, 0.45, 1);
      layout(pos.current);
    };
    fit(el.getBoundingClientRect().width || el.clientWidth);
    const ro = new ResizeObserver((entries) => fit(entries[0].contentRect.width));
    ro.observe(el);
    const onResize = () => fit(el.getBoundingClientRect().width);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [layout]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const c = cfg.current;
      if (c.count < 2) return;
      e.preventDefault();
      anim.current?.kill();
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? raw * 24 : raw;
      pos.current += clamp(px / (c.cardWidth * 0.9), -0.6, 0.6);
      layout(pos.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => goTo(Math.round(pos.current), true), 130);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [layout, goTo]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (cfg.current.count < 2) return;
    anim.current?.kill();
    drag.current = { x: e.clientX, startPos: pos.current, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const c = cfg.current;
      const unit = Math.max(c.cardWidth * 0.55 * scale.current, 40);
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 4) {
        d.moved = true;
        root.current?.setPointerCapture(d.id);
        for (const card of cards.current) card?.classList.remove("is-hovered");
      }
      if (!d.moved) return;
      const now = performance.now();
      const dt = Math.max(now - d.lastT, 1);
      d.v = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = now;
      pos.current = d.startPos - dx / unit;
      layout(pos.current);
    },
    [layout],
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.moved) return;
    const c = cfg.current;
    const unit = Math.max(c.cardWidth * 0.55 * scale.current, 40);
    goTo(Math.round(pos.current - (d.v * 180) / unit), true);
  }, [goTo]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    },
    [step],
  );

  const onCardClick = useCallback(
    (i: number) => {
      if (!drag.current?.moved) goTo(i, true);
    },
    [goTo],
  );

  // The front card tilts toward the pointer; on leave it settles back.
  const onCardMove = useCallback((e: React.PointerEvent, i: number) => {
    if (drag.current?.moved) return;
    const el = cards.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const ny = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const s = scale.current;
    el.style.setProperty("--glare-x", `${((nx + 1) * 50).toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${((ny + 1) * 50).toFixed(1)}%`);
    el.classList.add("is-hovered");
    el.style.transform = `translate(-50%, -50%) scale(${(s * 1.04).toFixed(3)}) translateZ(40px) rotateX(${(-ny * 18).toFixed(2)}deg) rotateY(${(nx * 18).toFixed(2)}deg)`;
  }, []);

  const onCardLeave = useCallback(
    (i: number) => {
      const el = cards.current[i];
      if (!el) return;
      setTimeout(() => el.classList.remove("is-hovered"), 260);
      layout(pos.current);
    },
    [layout],
  );

  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!autoplay || reduced.current || count < 2) return;
    const el = root.current;
    let hovered = false;
    let focused = false;
    const stop = () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    };
    const start = () => {
      stop();
      autoplayTimer.current = setInterval(
        () => {
          if (!hovered && !focused) step(1);
        },
        Math.max(cfg.current.autoplayDelay, 600),
      );
    };
    const enter = () => (hovered = true);
    const leave = () => (hovered = false);
    const focusIn = () => (focused = true);
    const focusOut = () => (focused = false);
    el?.addEventListener("mouseenter", enter);
    el?.addEventListener("mouseleave", leave);
    el?.addEventListener("focusin", focusIn);
    el?.addEventListener("focusout", focusOut);
    start();
    return () => {
      stop();
      el?.removeEventListener("mouseenter", enter);
      el?.removeEventListener("mouseleave", leave);
      el?.removeEventListener("focusin", focusIn);
      el?.removeEventListener("focusout", focusOut);
    };
  }, [autoplay, autoplayDelay, count, step]);

  useEffect(() => {
    layout(pos.current);
  }, [layout, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, cardWidth, cardHeight, radius, count]);

  useEffect(
    () => () => {
      anim.current?.kill();
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    },
    [],
  );

  return (
    <div
      ref={root}
      className={`depth-carousel ${className}`.trim()}
      style={{ "--dc-perspective": `${perspective}px` } as React.CSSProperties}
      role="group"
      aria-roledescription="carousel"
      aria-label="Identity cards"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="depth-carousel__stage">
        {list.map((item, i) => {
          const [label, tld] = (item.name || BRAND.exampleName).split(".");
          return (
            <div
              key={`${item.name}-${i}`}
              className="depth-carousel__card"
              ref={(el) => {
                cards.current[i] = el;
              }}
              style={{ width: cardWidth, height: cardHeight, borderRadius: radius }}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={active !== i}
              onClick={() => onCardClick(i)}
              onPointerMove={(e) => onCardMove(e, i)}
              onPointerLeave={() => onCardLeave(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="depth-carousel__img" src={item.image} alt={item.alt || ""} draggable={false} />
              <div className="depth-carousel__glare" />
              <div className="depth-carousel__vignette" />
              <div className="depth-carousel__name-badge">
                <div className="depth-carousel__badge-eyebrow">
                  <span>{BRAND.name} IDENTITY</span>
                  <span className="mono">01 / NAME</span>
                </div>
                <div className="depth-carousel__badge-title">
                  {label}
                  <span>.{tld || BRAND.tld}</span>
                </div>
                <div className="depth-carousel__badge-sub">02 / NODE · {nodePreview(item.name)}</div>
              </div>
              <span
                className="depth-carousel__tint"
                ref={(el) => {
                  tints.current[i] = el;
                }}
                style={{ background: tint }}
              />
            </div>
          );
        })}
      </div>
      {showControls && count > 1 && (
        <>
          <button type="button" className="depth-carousel__arrow depth-carousel__arrow--prev" aria-label="Previous slide" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="depth-carousel__arrow depth-carousel__arrow--next" aria-label="Next slide" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
      {showIndicators && count > 1 && (
        <div className="depth-carousel__dots" role="tablist" aria-label="Slides">
          <span className="depth-carousel__counter mono" aria-hidden="true">
            {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          {list.map((item, i) => (
            <button
              key={`${item.name}-dot-${i}`}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Go to slide ${i + 1}`}
              className={`depth-carousel__dot${active === i ? " is-active" : ""}`}
              onClick={() => goTo(i, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
