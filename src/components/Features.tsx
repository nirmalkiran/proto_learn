import { Sparkles, Zap, Shield } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "Beautiful Design",
    description: "Thoughtfully crafted with attention to every detail, creating an experience that delights.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized for performance, ensuring your application runs smoothly and efficiently.",
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Built with security in mind, protecting your data and your users at every step.",
  },
];

const Features = () => {
  return (
    <section className="py-24 px-6 bg-card">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-muted-foreground text-sm uppercase tracking-[0.3em] mb-4">
            Features
          </p>
          <h2 className="font-display text-3xl md:text-5xl font-medium text-foreground">
            Built for Excellence
          </h2>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group p-8 rounded-2xl bg-background hover:shadow-elevated transition-all duration-500 hover:-translate-y-1 opacity-0 animate-fade-up"
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent/20 transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-display text-xl font-medium text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="font-body text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
