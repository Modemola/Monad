import { Hero } from "@/components/landing/Hero";
import { BasisRibbon, BuiltWith, Closing, HowItWorks, IndexStory, TheCase, Thesis } from "@/components/landing/Sections";

export default function Landing() {
  return (
    <>
      <Hero />
      <BasisRibbon />
      <Thesis />
      <IndexStory />
      <HowItWorks />
      <TheCase />
      <BuiltWith />
      <Closing />
    </>
  );
}
