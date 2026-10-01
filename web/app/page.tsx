import { Hero } from "@/components/landing/Hero";
import { OneTransaction } from "@/components/landing/OneTransaction";
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
      <OneTransaction />
      <TheCase />
      <BuiltWith />
      <Closing />
    </>
  );
}
