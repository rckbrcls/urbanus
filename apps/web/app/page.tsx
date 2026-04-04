'use client';

import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Layers,
  MapPin,
  SquareMousePointer,
  PencilRuler,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/i18n";
import { SewerPipeBackground } from "@/components/landing/SewerPipeBackground";
import { useInView } from "@/hooks/use-in-view";

export default function LandingPage() {
  const tl = useTranslation('landing');
  const tc = useTranslation('common');

  const steps = [
    { icon: SquareMousePointer, ...tl.steps.drawArea },
    { icon: Zap, ...tl.steps.autoProcess },
    { icon: PencilRuler, ...tl.steps.editExport },
  ];

  const features = [
    { icon: GitBranch, ...tl.featureCards.pipeline },
    { icon: ShieldCheck, ...tl.featureCards.nbr },
    { icon: MapPin, ...tl.featureCards.openData },
    { icon: Layers, ...tl.featureCards.interactiveEditing },
  ];

  const [stepsRef, stepsInView] = useInView();
  const [featuresRef, featuresInView] = useInView();

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
        <SewerPipeBackground />
        <h1
          className="text-5xl font-bold tracking-tight md:text-6xl opacity-0"
          style={{
            fontFamily: "var(--font-baskerville)",
            animation: "fade-up 600ms var(--ease-out-strong) forwards",
          }}
        >
          Urbanus
        </h1>
        <p
          className="max-w-xl text-lg text-muted-foreground opacity-0"
          style={{
            animation: "fade-up 600ms var(--ease-out-strong) 80ms forwards",
          }}
        >
          {tl.tagline}
        </p>
        <div
          className="opacity-0"
          style={{
            animation: "fade-up 600ms var(--ease-out-strong) 160ms forwards",
          }}
        >
          <Button asChild size="lg" className="mt-2 gap-2 active:scale-[0.97] transition-transform duration-150">
            <Link href="/map">
              {tl.startDesigning}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section
        ref={stepsRef}
        className="flex min-h-[calc(100dvh-3rem)] flex-col justify-center border-t px-6 py-20"
      >
        <div className="mx-auto max-w-4xl">
          <h2
            className="mb-12 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground"
            style={stepsInView ? {
              animation: "reveal-up 500ms var(--ease-out-strong) forwards",
            } : { opacity: 0 }}
          >
            {tl.howItWorks}
          </h2>
          <div className="grid gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start">
            {steps.map((step, i) => (
              <div key={step.title} className="contents">
                <div
                  className="flex flex-col items-center text-center"
                  style={stepsInView ? {
                    opacity: 0,
                    animation: `reveal-up 500ms var(--ease-out-strong) ${i * 100}ms forwards`,
                  } : { opacity: 0 }}
                >
                  <div className="mb-3 flex size-6 items-center justify-center rounded-full bg-foreground text-background text-xs font-mono font-semibold">
                    {i + 1}
                  </div>
                  <div className="mb-4 flex size-12 items-center justify-center rounded-lg border bg-card text-foreground">
                    <step.icon className="size-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
                {/* Connector between steps — desktop only */}
                {i < steps.length - 1 && (
                  <div
                    className="hidden md:flex items-center justify-center pt-10 text-muted-foreground/40"
                    style={stepsInView ? {
                      opacity: 0,
                      animation: `reveal-up 500ms var(--ease-out-strong) ${i * 100 + 50}ms forwards`,
                    } : { opacity: 0 }}
                  >
                    <ChevronRight className="size-5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        ref={featuresRef}
        className="flex min-h-[calc(100dvh-3rem)] flex-col justify-center border-t px-6 py-20"
      >
        <div className="mx-auto max-w-4xl">
          <h2
            className="mb-12 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground"
            style={featuresInView ? {
              animation: "reveal-up 500ms var(--ease-out-strong) forwards",
            } : { opacity: 0 }}
          >
            {tl.features}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="card-hover rounded-lg border bg-card p-6 transition-[transform,box-shadow] duration-200 ease-out"
                style={featuresInView ? {
                  opacity: 0,
                  animation: `reveal-up 500ms var(--ease-out-strong) ${i * 80}ms forwards`,
                } : { opacity: 0 }}
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-md border bg-background text-foreground">
                  <feature.icon className="size-4" />
                </div>
                <h3 className="mb-1 text-sm font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t px-6 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between text-xs text-muted-foreground">
          <span style={{ fontFamily: "var(--font-baskerville)" }}>
            Urbanus
          </span>
          <nav className="flex gap-4">
            <Link href="/map" className="transition-colors hover:text-foreground">
              {tc.map}
            </Link>
            <Link href="/projects" className="transition-colors hover:text-foreground">
              {tc.projects}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
