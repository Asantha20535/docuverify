import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Settings, User, Lock, FileSignature, Upload } from "lucide-react";

interface ProfileUpdateData {
  email: string;
  fullName: string;
}

interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Profile form state
  const [profileData, setProfileData] = useState<ProfileUpdateData>({
    email: user?.email || "",
    fullName: user?.fullName || "",
  });

  // Password form state
  const [passwordData, setPasswordData] = useState<PasswordChangeData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Signature upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: async (data: ProfileUpdateData) => {
      const response = await fetch(`/api/users/${user?.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update profile");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile information has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Password change mutation
  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await fetch(`/api/users/${user?.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to change password");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Password Change Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Signature upload mutation
  const signatureMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("signature", file);

      const response = await fetch(`/api/users/${user?.id}/signature`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload signature");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Signature Uploaded",
        description: "Your signature has been uploaded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle profile form submission
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileData.email || !profileData.fullName) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    profileMutation.mutate(profileData);
  };

  // Handle password form submission
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    passwordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  // Handle signature file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type and size
      const validTypes = ["image/jpeg", "image/jpg", "image/png"];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a JPEG or PNG image.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "File Too Large",
          description: "Please upload an image smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  // Handle signature upload
  const handleSignatureUpload = () => {
    if (selectedFile) {
      signatureMutation.mutate(selectedFile);
    }
  };

  // Reset form data when dialog opens
  const handleDialogOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setProfileData({
        email: user?.email || "",
        fullName: user?.fullName || "",
      });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSelectedFile(null);
    }
  };

  if (!user) return null;

  const isNonStudent = user.role !== "student";

  return (
    <>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => setOpen(true)}
        data-testid="button-profile-settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
      
      <Dialog open={open} onOpenChange={handleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className={`grid w-full ${isNonStudent ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            {isNonStudent && <TabsTrigger value="signature">Signature</TabsTrigger>}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal Information
                </CardTitle>
                <CardDescription>
                  Update your basic profile information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={user.username}
                        disabled
                        className="bg-gray-50"
                      />
                      <p className="text-xs text-gray-500">Username cannot be changed</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        placeholder="Enter your email"
                        data-testid="input-email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                        placeholder="Enter your full name"
                        data-testid="input-fullname"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Input
                        id="role"
                        value={user.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        disabled
                        className="bg-gray-50"
                      />
                      <p className="text-xs text-gray-500">Role is assigned by administrators</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={profileMutation.isPending}
                      data-testid="button-update-profile"
                    >
                      {profileMutation.isPending ? "Updating..." : "Update Profile"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password for security
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      placeholder="Enter your current password"
                      data-testid="input-current-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="Enter new password (min 6 characters)"
                      data-testid="input-new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      placeholder="Confirm your new password"
                      data-testid="input-confirm-password"
                    />
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={passwordMutation.isPending}
                      data-testid="button-change-password"
                    >
                      {passwordMutation.isPending ? "Changing..." : "Change Password"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Signature Tab (Non-students only) */}
          {isNonStudent && (
            <TabsContent value="signature" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4" />
                    Digital Signature
                  </CardTitle>
                  <CardDescription>
                    Upload your signature for document signing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current signature display */}
                  {user.signature && (
                    <div className="space-y-2">
                      <Label>Current Signature</Label>
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <img 
                          src={`/uploads/signatures/${user.signature}`} 
                          alt="Current signature"
                          className="max-h-20 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* File upload */}
                  <div className="space-y-2">
                    <Label htmlFor="signatureFile">
                      {user.signature ? "Update Signature" : "Upload Signature"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="signatureFile"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handleFileSelect}
                        className="flex-1"
                        data-testid="input-signature-file"
                      />
                      <Button
                        type="button"
                        onClick={handleSignatureUpload}
                        disabled={!selectedFile || signatureMutation.isPending}
                        className="shrink-0"
                        data-testid="button-upload-signature"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {signatureMutation.isPending ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                    {selectedFile && (
                      <p className="text-xs text-gray-600">
                        Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Supported formats: JPEG, PNG (max 5MB)
                    </p>
                  </div>

                  {/* Preview selected file */}
                  {selectedFile && (
                    <div className="space-y-2">
                      <Label>Preview</Label>
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <img 
                          src={URL.createObjectURL(selectedFile)} 
                          alt="Signature preview"
                          className="max-h-20 object-contain"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
