import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Target,
  TrendingUp,
  Users,
  Code,
  GitBranch,
  BarChart3,
  CheckCircle,
  Clock,
  Shield,
  Rocket,
  ArrowRight,
  FileCode,
  TestTube,
  Brain,
  Layers,
  DollarSign,
  Check,
  X,
  Crown,
} from "lucide-react";

const slides = [
  {
    id: 1,
    type: "cover",
    title: "AI-Powered Test Management Platform",
    subtitle: "Transform Testing from Manual to Intelligent",
    tagline: "From User Stories to Executable Automation in Minutes",
  },
  {
    id: 2,
    type: "problem",
    title: "The Testing Challenge",
    problems: [
      { icon: Clock, text: "Manual testing is slow and expensive", stat: "70% of QA time spent on repetitive tasks" },
      { icon: Code, text: "Test automation requires deep technical expertise", stat: "6+ months to build automation frameworks" },
      { icon: Layers, text: "Disconnected tools create silos", stat: "5+ tools for complete testing workflow" },
      { icon: Target, text: "Quality bottlenecks delay releases", stat: "Testing accounts for 40% of release delays" },
    ],
  },
  {
    id: 3,
    type: "solution",
    title: "The AI Solution",
    subtitle: "End-to-End Intelligence for Your Testing Lifecycle",
    features: [
      "AI-powered test case generation from user stories",
      "Automatic automation code generation (Java/Python/JS)",
      "Integrated API, Performance & UI testing",
      "Real-time analytics and insights",
      "Seamless CI/CD integration",
    ],
  },
  {
    id: 4,
    type: "features",
    title: "Key Capabilities",
    features: [
      {
        icon: Brain,
        title: "AI Test Generation",
        description: "Generate comprehensive test cases from user stories using GPT-4",
        benefit: "Save 70% of test case creation time",
      },
      {
        icon: FileCode,
        title: "Smart Automation",
        description: "Auto-generate Page Objects, Step Definitions & Test Classes",
        benefit: "Reduce automation development by 50%",
      },
      {
        icon: TestTube,
        title: "Integrated Testing",
        description: "API, Performance (JMeter), and UI testing in one platform",
        benefit: "Single source of truth",
      },
      {
        icon: BarChart3,
        title: "Intelligent Analytics",
        description: "Real-time dashboards with AI-powered insights",
        benefit: "Data-driven decisions",
      },
    ],
  },
  {
    id: 5,
    type: "features",
    title: "Advanced Features",
    features: [
      {
        icon: Sparkles,
        title: "Repository Module",
        description: "Visual DOM analysis for accurate locator generation",
        benefit: "99% locator accuracy",
      },
      {
        icon: GitBranch,
        title: "CI/CD Integration",
        description: "GitHub, Azure DevOps, and Jira connectivity",
        benefit: "Seamless workflow",
      },
      {
        icon: Shield,
        title: "Defect Tracking",
        description: "Built-in defect management with AI-generated reports",
        benefit: "Faster resolution",
      },
      {
        icon: Zap,
        title: "HAR & Swagger",
        description: "Convert API specs to test cases and performance tests",
        benefit: "Instant API testing",
      },
    ],
  },
  {
    id: 6,
    type: "workflow",
    title: "How It Works",
    subtitle: "Streamlined Testing Workflow",
    steps: [
      { number: 1, icon: Users, text: "Import User Stories", description: "From Jira or manual entry" },
      { number: 2, icon: Brain, text: "AI Analyzes", description: "GPT-4 generates test scenarios" },
      { number: 3, icon: CheckCircle, text: "Test Cases Created", description: "Comprehensive coverage" },
      { number: 4, icon: Code, text: "Automation Generated", description: "Page Objects & Tests" },
      { number: 5, icon: Rocket, text: "Execute & Report", description: "Real-time results" },
    ],
  },
  {
    id: 7,
    type: "tech",
    title: "Powered By Modern Technology",
    stack: [
      { category: "AI Engine", items: ["OpenAI GPT-4", "Vision API for DOM Analysis", "Intelligent Code Generation"] },
      { category: "Automation", items: ["Selenium WebDriver", "Apache JMeter", "Multi-language Support"] },
      { category: "Platform", items: ["React + TypeScript", "Supabase Backend", "Real-time Database"] },
      { category: "Integration", items: ["GitHub API", "Azure DevOps", "Jira Cloud"] },
    ],
  },
  {
    id: 8,
    type: "differentiators",
    title: "Why Choose Us?",
    points: [
      { icon: Layers, title: "End-to-End Platform", description: "Not just a tool - complete testing lifecycle" },
      { icon: Brain, title: "AI at Every Step", description: "From test design to defect reporting" },
      { icon: Code, title: "Framework Agnostic", description: "Generate code for any framework" },
      { icon: TrendingUp, title: "Continuous Learning", description: "AI improves with your usage patterns" },
    ],
  },
  {
    id: 9,
    type: "roi",
    title: "Proven ROI & Impact",
    metrics: [
      { value: "70%", label: "Reduction in Test Creation Time", icon: Clock },
      { value: "50%", label: "Faster Automation Development", icon: Zap },
      { value: "3x", label: "Improvement in Test Coverage", icon: Target },
      { value: "40%", label: "Decrease in Release Delays", icon: TrendingUp },
    ],
    calculation: {
      scenario: "Team of 5 QA Engineers",
      savings: [
        "15 min saved per test case",
        "200 test cases per month",
        "= 50 hours saved monthly",
        "= $5,000+ in productivity gains",
      ],
    },
  },
  {
    id: 10,
    type: "comparison",
    title: "Competitive Advantage",
    subtitle: "Industry-Leading Value & Capabilities",
    competitors: [
      {
        name: "AI Test Platform",
        pricing: "$8,000-10,000",
        period: "/year",
        highlight: true,
        features: {
          aiGeneration: true,
          codeGeneration: true,
          allInOne: true,
          visualDom: true,
          cicd: true,
          analytics: true,
        },
      },
      {
        name: "Functionize",
        pricing: "$50,000",
        period: "/year",
        highlight: false,
        features: {
          aiGeneration: true,
          codeGeneration: false,
          allInOne: false,
          visualDom: true,
          cicd: true,
          analytics: true,
        },
      },
      {
        name: "Katalon Studio",
        pricing: "$3,000",
        period: "/year",
        highlight: false,
        features: {
          aiGeneration: false,
          codeGeneration: true,
          allInOne: true,
          visualDom: false,
          cicd: true,
          analytics: false,
        },
      },
      {
        name: "TestSigma",
        pricing: "$12,000",
        period: "/year",
        highlight: false,
        features: {
          aiGeneration: true,
          codeGeneration: false,
          allInOne: true,
          visualDom: false,
          cicd: true,
          analytics: true,
        },
      },
    ],
    featureLabels: [
      "AI-Powered Test Generation",
      "Auto Code Generation (Java/Python/JS)",
      "API + Performance + UI Testing",
      "Visual DOM Analysis",
      "CI/CD Integration",
      "Real-time Analytics",
    ],
  },
  {
    id: 11,
    type: "use-cases",
    title: "Perfect For",
    cases: [
      {
        icon: Users,
        title: "Enterprise Software Teams",
        description: "Scale testing for complex applications with distributed teams",
      },
      {
        icon: Rocket,
        title: "Agile Development",
        description: "Keep pace with rapid sprint cycles and continuous delivery",
      },
      {
        icon: Target,
        title: "QA Transformation",
        description: "Modernize testing practices and upskill manual testers",
      },
      {
        icon: GitBranch,
        title: "DevOps Teams",
        description: "Integrate testing seamlessly into CI/CD pipelines",
      },
    ],
  },
  {
    id: 12,
    type: "cta",
    title: "Ready to Transform Your Testing?",
    subtitle: "Join Forward-Thinking Teams Using AI for Quality",
    benefits: [
      "14-day free trial",
      "No credit card required",
      "Full platform access",
      "24/7 support included",
    ],
  },
];

const SalesDeck = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") nextSlide();
    if (e.key === "ArrowLeft") prevSlide();
  };

  const slide = slides[currentSlide];

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header with navigation */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">AI Test Platform</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentSlide + 1} / {slides.length}
            </span>
            <Button variant="outline" size="sm" onClick={prevSlide} disabled={currentSlide === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={nextSlide} disabled={currentSlide === slides.length - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main slide content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-6xl animate-fade-in">
          {slide.type === "cover" && (
            <div className="text-center space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Next Generation Testing</span>
              </div>
              <h1 className="text-6xl md:text-7xl font-bold bg-gradient-primary bg-clip-text text-transparent leading-tight">
                {slide.title}
              </h1>
              <p className="text-2xl md:text-3xl text-muted-foreground">{slide.subtitle}</p>
              <p className="text-xl text-foreground/80">{slide.tagline}</p>
              <div className="flex justify-center gap-4 pt-8">
                <Button size="lg" className="bg-gradient-primary hover:shadow-glow">
                  Get Started <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="outline" size="lg">
                  Watch Demo
                </Button>
              </div>
            </div>
          )}

          {slide.type === "problem" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {slide.problems?.map((problem, idx) => (
                  <Card key={idx} className="p-6 hover:shadow-medium transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-destructive/10">
                        <problem.icon className="h-6 w-6 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{problem.text}</h3>
                        <p className="text-muted-foreground">{problem.stat}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide.type === "solution" && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-5xl font-bold mb-4">{slide.title}</h2>
                <p className="text-2xl text-muted-foreground">{slide.subtitle}</p>
              </div>
              <Card className="p-8 bg-gradient-primary/5 border-primary/20">
                <div className="space-y-4">
                  {slide.features?.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                      <span className="text-lg">{feature}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {slide.type === "features" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {slide.features?.map((feature, idx) => (
                  <Card key={idx} className="p-6 hover:shadow-medium transition-all hover:-translate-y-1">
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-primary/10 w-fit">
                        <feature.icon className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-bold text-xl">{feature.title}</h3>
                      <p className="text-muted-foreground">{feature.description}</p>
                      <div className="pt-2 border-t">
                        <span className="text-sm font-medium text-primary">{feature.benefit}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide.type === "workflow" && (
            <div className="space-y-12">
              <div className="text-center">
                <h2 className="text-5xl font-bold mb-4">{slide.title}</h2>
                <p className="text-xl text-muted-foreground">{slide.subtitle}</p>
              </div>
              <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                {slide.steps?.map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center text-center max-w-xs">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground mb-4">
                        {step.number}
                      </div>
                      {idx < slide.steps!.length - 1 && (
                        <ArrowRight className="hidden md:block absolute -right-10 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <step.icon className="h-8 w-8 text-primary mb-3" />
                    <h3 className="font-bold text-lg mb-2">{step.text}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slide.type === "tech" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {slide.stack?.map((category, idx) => (
                  <Card key={idx} className="p-6">
                    <h3 className="font-bold text-xl mb-4 text-primary">{category.category}</h3>
                    <ul className="space-y-2">
                      {category.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide.type === "differentiators" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {slide.points?.map((point, idx) => (
                  <Card key={idx} className="p-6 hover:shadow-medium transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <point.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">{point.title}</h3>
                        <p className="text-muted-foreground">{point.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide.type === "roi" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-4 gap-6 mb-8">
                {slide.metrics?.map((metric, idx) => (
                  <Card key={idx} className="p-6 text-center hover:shadow-medium transition-shadow">
                    <metric.icon className="h-8 w-8 text-primary mx-auto mb-4" />
                    <div className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                      {metric.value}
                    </div>
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                  </Card>
                ))}
              </div>
              <Card className="p-8 bg-primary/5">
                <h3 className="font-bold text-xl mb-4">{slide.calculation?.scenario}</h3>
                <div className="space-y-2">
                  {slide.calculation?.savings.map((saving, idx) => (
                    <p key={idx} className="text-lg">
                      {saving}
                    </p>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {slide.type === "comparison" && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-5xl font-bold mb-4">{slide.title}</h2>
                <p className="text-xl text-muted-foreground">{slide.subtitle}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {slide.competitors?.map((competitor, idx) => (
                  <Card 
                    key={idx} 
                    className={`p-6 relative ${
                      competitor.highlight 
                        ? 'border-primary border-2 shadow-glow bg-primary/5' 
                        : 'hover:shadow-medium'
                    } transition-all`}
                  >
                    {competitor.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <div className="bg-gradient-primary px-4 py-1 rounded-full flex items-center gap-1">
                          <Crown className="h-3 w-3 text-primary-foreground" />
                          <span className="text-xs font-bold text-primary-foreground">Best Value</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="text-center mb-6 pt-2">
                      <h3 className={`font-bold text-xl mb-3 ${competitor.highlight ? 'text-primary' : ''}`}>
                        {competitor.name}
                      </h3>
                      <div className="flex items-baseline justify-center gap-1">
                        <DollarSign className={`h-5 w-5 ${competitor.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-3xl font-bold ${competitor.highlight ? 'text-primary' : ''}`}>
                          {competitor.pricing.replace('$', '')}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">{competitor.period}</span>
                    </div>

                    <div className="space-y-3">
                      {slide.featureLabels?.map((label, featureIdx) => {
                        const featureKey = Object.keys(competitor.features)[featureIdx];
                        const hasFeature = competitor.features[featureKey as keyof typeof competitor.features];
                        
                        return (
                          <div key={featureIdx} className="flex items-start gap-2">
                            {hasFeature ? (
                              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                            )}
                            <span className={`text-xs leading-tight ${hasFeature ? '' : 'text-muted-foreground/60'}`}>
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
              
              <div className="text-center pt-4">
                <p className="text-sm text-muted-foreground">
                  * Pricing based on standard enterprise plans. Custom pricing available.
                </p>
              </div>
            </div>
          )}

          {slide.type === "use-cases" && (
            <div className="space-y-8">
              <h2 className="text-5xl font-bold text-center mb-12">{slide.title}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {slide.cases?.map((useCase, idx) => (
                  <Card key={idx} className="p-6 hover:shadow-medium transition-all hover:-translate-y-1">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <useCase.icon className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl mb-2">{useCase.title}</h3>
                        <p className="text-muted-foreground">{useCase.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide.type === "cta" && (
            <div className="text-center space-y-8">
              <h2 className="text-5xl font-bold mb-4">{slide.title}</h2>
              <p className="text-2xl text-muted-foreground mb-8">{slide.subtitle}</p>
              <div className="flex flex-wrap justify-center gap-6 mb-8">
                {slide.benefits?.map((benefit, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    <span className="font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button size="lg" className="bg-gradient-primary hover:shadow-glow text-lg px-8">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="outline" size="lg" className="text-lg px-8">
                  Contact Sales
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-6">
                Questions? Email us at{" "}
                <a href="mailto:sales@example.com" className="text-primary hover:underline">
                  sales@example.com
                </a>
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer with slide indicators */}
      <footer className="border-t bg-card/50 backdrop-blur-sm py-4">
        <div className="container mx-auto px-6">
          <div className="flex justify-center gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentSlide ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SalesDeck;
