import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Settings, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRoles, UserRole } from "@/hooks/useRoles";

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role?: UserRole;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectMembership {
  id: string;
  project_id: string;
  user_id: string;
  project_name: string;
}

const RoleManager = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMemberships, setProjectMemberships] = useState<Record<string, ProjectMembership[]>>({});
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("user");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [membershipToRemove, setMembershipToRemove] = useState<{ membershipId: string; userName: string; projectName: string } | null>(null);
  const { toast } = useToast();
  const { assignRole, removeRole, isAdmin } = useRoles();

  const fetchUsersWithRoles = async () => {
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, email');

      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        role: roles?.find(role => role.user_id === profile.user_id)?.role
      })) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch users",
      });
    }
  };

  const fetchProjects = async () => {
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setProjects(projects || []);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch projects",
      });
    }
  };

  const fetchProjectMemberships = async () => {
    try {
      const { data: memberships, error } = await supabase
        .from('project_members')
        .select(`
          id,
          user_id,
          project_id,
          projects (name)
        `);

      if (error) throw error;

      // Group memberships by user_id
      const membershipsByUser: Record<string, ProjectMembership[]> = {};
      memberships?.forEach((membership: any) => {
        if (!membershipsByUser[membership.user_id]) {
          membershipsByUser[membership.user_id] = [];
        }
        membershipsByUser[membership.user_id].push({
          id: membership.id,
          project_id: membership.project_id,
          user_id: membership.user_id,
          project_name: membership.projects?.name || 'Unknown Project'
        });
      });

      setProjectMemberships(membershipsByUser);
    } catch (error: any) {
      console.error('Error fetching project memberships:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch project memberships",
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchUsersWithRoles(), fetchProjects(), fetchProjectMemberships()]);
    setLoading(false);
  };

  const handleAssignRole = async (userId: string, role: UserRole) => {
    const success = await assignRole(userId, role);
    if (success) {
      await fetchUsersWithRoles();
    }
  };

  const handleRemoveRole = async (userId: string) => {
    const success = await removeRole(userId);
    if (success) {
      await fetchUsersWithRoles();
    }
  };

  const handleAssignProject = async () => {
    if (!selectedUser || !selectedProject) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select both user and project",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('project_members')
        .insert({
          user_id: selectedUser,
          project_id: selectedProject,
          role: 'member'
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            variant: "destructive",
            title: "Error",
            description: "User is already a member of this project",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Success",
        description: "User assigned to project successfully",
      });
      
      setSelectedUser("");
      setSelectedProject("");
      await fetchProjectMemberships();
    } catch (error: any) {
      console.error('Error assigning project:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to assign project",
      });
    }
  };

  const handleRemoveProjectMembership = async () => {
    if (!membershipToRemove) return;

    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', membershipToRemove.membershipId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Removed ${membershipToRemove.userName} from ${membershipToRemove.projectName}`,
      });

      await fetchProjectMemberships();
      setMembershipToRemove(null);
    } catch (error: any) {
      console.error('Error removing project membership:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove project membership",
      });
    }
  };

  const handleInviteUser = async () => {
    if (!newUserEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter an email address",
      });
      return;
    }

    try {
      // Get current user for inviter name
      const { data: currentUser } = await supabase.auth.getUser();
      const currentUserProfile = users.find(u => u.user_id === currentUser.user?.id);
      const inviterName = currentUserProfile?.display_name || "Administrator";

      // Call the edge function to send invitation email
      const { data, error } = await supabase.functions.invoke('send-invitation-email', {
        body: {
          email: newUserEmail,
          role: selectedRole,
          inviterName
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Invitation Sent",
          description: `Invitation email sent to ${newUserEmail} with ${selectedRole} role`,
        });
        
        setNewUserEmail("");
        setSelectedRole("user");
      } else {
        throw new Error(data.error || "Failed to send invitation");
      }
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send invitation email",
      });
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>
            You need admin privileges to manage user roles.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>Loading users...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite New User</CardTitle>
          <CardDescription>
            Send an invitation to a new user with a specific role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="user@example.com"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={selectedRole} onValueChange={(value: UserRole) => setSelectedRole(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="tester">Tester</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInviteUser}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign Project to User</CardTitle>
          <CardDescription>
            Add users as members to projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.display_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignProject}>
              <Settings className="mr-2 h-4 w-4" />
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Roles</CardTitle>
          <CardDescription>
            Manage roles for existing users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user.user_id} className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{user.display_name || user.email}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    {user.role && (
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={user.role || ""}
                      onValueChange={(role: UserRole) => handleAssignRole(user.user_id, role)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="tester">Tester</SelectItem>
                      </SelectContent>
                    </Select>
                    {user.role && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveRole(user.user_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {projectMemberships[user.user_id] && projectMemberships[user.user_id].length > 0 && (
                  <div className="ml-8 flex flex-wrap gap-2">
                    {projectMemberships[user.user_id].map((membership) => (
                      <Badge key={membership.id} variant="outline" className="flex items-center gap-1">
                        {membership.project_name}
                        <button
                          onClick={() => setMembershipToRemove({
                            membershipId: membership.id,
                            userName: user.display_name || user.email || '',
                            projectName: membership.project_name
                          })}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!membershipToRemove} onOpenChange={() => setMembershipToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User from Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{membershipToRemove?.userName}</strong> from project <strong>{membershipToRemove?.projectName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveProjectMembership}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RoleManager;