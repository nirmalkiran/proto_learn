const Footer = () => {
  return (
    <footer className="py-12 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="font-display text-xl font-medium text-foreground">
          Your Brand
        </p>
        <p className="font-body text-sm text-muted-foreground">
          © 2024 All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
