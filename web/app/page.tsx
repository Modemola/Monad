import { Hero } from "@/components/landing/Hero";
import { BuiltWith, Closing, HowItWorks, IndexStage, IndexStory, TheCase, Thesis, TickerBand } from "@/components/landing/Sections";

export default function Landing() {
  return (
    <>
      <Hero />
      <TickerBand />
      <Thesis />
      <IndexStage />
      <IndexStory />
      <HowItWorks />
      <TheCase />
      <BuiltWith />
      <Closing />
    </>
  );
}
