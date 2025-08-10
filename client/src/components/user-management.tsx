import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Upload, Trash2, Power, PowerOff, Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ProfileSettings from "./profile-settings";
import type { User as UserType } from "@/types";

interface UserManagementProps {
  users: UserType[];
}

export default function UserManagement({ users }: UserManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    fullName: "",
    password: "",
    role: "",
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const response = await apiRequest("POST", "/api/admin/users", userData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Created",
        description: "New user has been created successfully",
      });
      
      setNewUser({
        username: "",
        email: "",
        fullName: "",
        password: "",
        role: "",
      });
      setIsAddUserOpen(false);
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Deleted",
        description: "User has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const endpoint = isActive ? "deactivate" : "activate";
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/${endpoint}`);
      return response.json();
    },
    onSuccess: (_, { isActive }) => {
      toast({
        title: `User ${isActive ? "Deactivated" : "Activated"}`,
        description: `User has been ${isActive ? "deactivated" : "activated"} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Status Update Failed",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    },
  });

  const uploadSignatureMutation = useMutation({
    mutationFn: async ({ userId, file }: { userId: string; file: File }) => {
      const formData = new FormData();
      formData.append('signature', file);
      
      const response = await apiRequest("POST", `/api/admin/users/${userId}/signature`, formData, {
        headers: {
          // Don't set Content-Type, let the browser set it with boundary
        },
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Signature Uploaded",
        description: "Signature has been uploaded successfully",
      });
      setIsSignatureModalOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload signature",
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.username || !newUser.email || !newUser.fullName || !newUser.password || !newUser.role) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    createUserMutation.mutate(newUser);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = !roleFilter || roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      student: "bg-blue-100 text-blue-700",
      academic_staff: "bg-green-100 text-green-700",
      department_head: "bg-purple-100 text-purple-700",
      dean: "bg-red-100 text-red-700",
      vice_chancellor: "bg-orange-100 text-orange-700",
      assistant_registrar: "bg-yellow-100 text-yellow-700",
      course_unit: "bg-indigo-100 text-indigo-700",
      admin: "bg-gray-100 text-gray-700",
    };
    return colors[role] || "bg-gray-100 text-gray-700";
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>User Management</CardTitle>
          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    data-testid="input-new-username"
                    type="text"
                    required
                    className="mt-1"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    data-testid="input-new-email"
                    type="email"
                    required
                    className="mt-1"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    data-testid="input-new-fullname"
                    type="text"
                    required
                    className="mt-1"
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    data-testid="input-new-password"
                    type="password"
                    required
                    className="mt-1"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger className="mt-1" data-testid="select-new-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="academic_staff">Academic Staff</SelectItem>
                      <SelectItem value="department_head">Department Head</SelectItem>
                      <SelectItem value="dean">Dean</SelectItem>
                      <SelectItem value="vice_chancellor">Vice Chancellor</SelectItem>
                      <SelectItem value="assistant_registrar">Assistant Registrar</SelectItem>
                      <SelectItem value="course_unit">Course Unit</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Signature upload for non-student users */}
                {newUser.role && newUser.role !== "student" && (
                  <div>
                    <Label htmlFor="signature">Signature (Optional)</Label>
                    <Input
                      id="signature"
                      type="file"
                      accept="image/*"
                      className="mt-1"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Store file for later upload
                          setNewUser({ ...newUser, signature: file as any });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Upload signature image for document signing
                    </p>
                  </div>
                )}
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-create-user">
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search users..."
                data-testid="input-search-users"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="md:w-48" data-testid="select-filter-role">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="academic_staff">Academic Staff</SelectItem>
                <SelectItem value="department_head">Department Head</SelectItem>
                <SelectItem value="dean">Dean</SelectItem>
                <SelectItem value="vice_chancellor">Vice Chancellor</SelectItem>
                <SelectItem value="assistant_registrar">Assistant Registrar</SelectItem>
                <SelectItem value="course_unit">Course Unit</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-gray-50" data-testid={`user-row-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <User className="text-gray-600" />
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900" data-testid="text-user-name">
                              {user.fullName}
                            </div>
                            <ProfileSettings 
                              user={user} 
                              trigger={
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Profile Settings">
                                  <Settings className="w-3 h-3" />
                                </Button>
                              }
                            />
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {formatRoleName(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {/* Signature upload for non-student users */}
                        {user.role !== "student" && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setSelectedUser(user);
                              setIsSignatureModalOpen(true);
                            }}
                            title="Upload signature"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* Toggle user status */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => toggleUserStatusMutation.mutate({ userId: user.id, isActive: user.isActive })}
                          disabled={toggleUserStatusMutation.isPending}
                          title={user.isActive ? "Deactivate user" : "Activate user"}
                        >
                          {user.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </Button>
                        
                        {/* Delete user */}
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${user.fullName}?`)) {
                              deleteUserMutation.mutate(user.id);
                            }
                          }}
                          disabled={deleteUserMutation.isPending}
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Signature Upload Modal */}
      <Dialog open={isSignatureModalOpen} onOpenChange={setIsSignatureModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Signature for {selectedUser?.fullName}</DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">User Details</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Name:</strong> {selectedUser.fullName}</p>
                  <p><strong>Role:</strong> {formatRoleName(selectedUser.role)}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="signature-file">Signature Image</Label>
                <Input
                  id="signature-file"
                  type="file"
                  accept="image/*"
                  className="mt-1"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      uploadSignatureMutation.mutate({ userId: selectedUser.id, file });
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload a signature image (PNG, JPG, etc.) for document signing
                </p>
              </div>

              {selectedUser.signature && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-green-700">
                    ✓ Signature already uploaded: {selectedUser.signature}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsSignatureModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
