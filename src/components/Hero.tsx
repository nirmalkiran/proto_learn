import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 py-20">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-muted-foreground text-sm uppercase tracking-[0.3em] mb-6 opacity-0 animate-fade-up">
          Welcome
        </p>
        
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-medium text-foreground leading-[1.1] mb-8 opacity-0 animate-fade-up delay-100">
          Crafting Digital
          <span className="block text-accent">Experiences</span>
        </h1>
        
        <p className="font-body text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed opacity-0 animate-fade-up delay-200">
          A minimal canvas for your next great idea. Simple, elegant, and ready to transform into something extraordinary.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-fade-up delay-300">
          <Button variant="hero" size="lg">
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="hero-outline" size="lg">
            Learn More
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
