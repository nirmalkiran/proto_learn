import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Moon } from "lucide-react";
import wisprFullLogo from "@/assets/wispr-logo-new.svg";
import wisprDarkLogo from "@/assets/wispr-logo-dark.svg";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getUserInitials = (email: string) => {
    if (!email) return 'U';
    const parts = email.split('@')[0].split('.');
    if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="w-full flex items-center justify-between">
      <div className="flex items-center">
        <img src={theme === 'dark' ? wisprDarkLogo : wisprFullLogo} alt="WISPR" className="h-8" />
      </div>
      
      <div className="flex items-center space-x-4">
        {loading ? (
          <div className="w-20 h-8 animate-pulse bg-muted rounded" />
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center space-x-3 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gradient-primary text-white font-medium text-sm">
                    {getUserInitials(user.email || '')}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.email?.split('@')[0].replace('.', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex items-center justify-between" onClick={(e) => e.preventDefault()}>
                <div className="flex items-center space-x-2">
                  <Moon className="h-4 w-4" />
                  <span>Dark Mode</span>
                </div>
                <Switch 
                  checked={theme === 'dark'} 
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="flex items-center space-x-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button variant="default" size="sm" className="bg-gradient-primary hover:opacity-90" asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Header;