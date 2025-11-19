import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Settings, User, Lock, Eye, EyeOff, PenTool } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { User as UserType } from "@/types";
import SignaturePad from "./signature-pad";

interface ProfileSettingsProps {
  user: UserType;
  trigger?: React.ReactNode;
}

export default function ProfileSettings({ user, trigger }: ProfileSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [profileData, setProfileData] = useState({
    fullName: user.fullName,
    email: user.email,
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [savedSignature, setSavedSignature] = useState<string | null>(user.signature || null);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(user.signature || null);
  const [editingSignature, setEditingSignature] = useState(!user.signature);

  useEffect(() => {
    setSavedSignature(user.signature || null);
    setSignatureDraft(user.signature || null);
    setEditingSignature(!user.signature);
  }, [user.signature]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileData) => {
      const response = await apiRequest("PATCH", "/api/profile", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully",
      });
      
      // Update the user data in the query cache
      queryClient.setQueryData(["/api/auth/me"], data.user);
      
      // Close the modal
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordData) => {
      const response = await apiRequest("PATCH", "/api/profile/password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been changed successfully",
      });
      
      // Reset password fields
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const saveSignatureMutation = useMutation({
    mutationFn: async (signatureValue: string) => {
      const response = await apiRequest("POST", "/api/profile/signature", {
        signature: signatureValue,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Signature Saved",
        description: "Your digital signature has been saved successfully",
      });
      setSavedSignature(data.signature);
      setSignatureDraft(data.signature);
      setEditingSignature(false);
      queryClient.setQueryData(["/api/auth/me"], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, signature: data.signature };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save signature",
        variant: "destructive",
      });
    },
  });

  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileData.fullName || !profileData.email) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    updateProfileMutation.mutate(profileData);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all password fields",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate(passwordData);
  };

  const handleSignatureSave = () => {
    if (!signatureDraft) {
      toast({
        title: "Error",
        description: "Please draw your signature before saving",
        variant: "destructive",
      });
      return;
    }
    saveSignatureMutation.mutate(signatureDraft);
  };

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const canUploadSignature = user.role !== "student";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" title="Profile Settings">
            <Settings className="w-4 h-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-gray-300 rounded-full flex items-center justify-center">
                  <User className="text-gray-600" />
                </div>
                <div>
                  <div className="font-medium">{user.fullName}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                  <Badge variant="secondary" className="mt-1">
                    {formatRoleName(user.role)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Tabs */}
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </TabsTrigger>
              {canUploadSignature && (
                <TabsTrigger value="signature" className="flex items-center gap-2">
                  <PenTool className="w-4 h-4" />
                  Signature
                </TabsTrigger>
              )}
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4">
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    required
                    value={profileData.fullName}
                    onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? "Updating..." : "Update Profile"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Password Tab */}
            <TabsContent value="password" className="space-y-4">
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      required
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Password must be at least 8 characters long
                  </p>
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={changePasswordMutation.isPending}
                  >
                    {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Signature Tab */}
            {canUploadSignature && (
              <TabsContent value="signature" className="space-y-4">
                <div className="space-y-4">
                  {savedSignature ? (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-700 mb-2">Saved Signature</p>
                      <img
                        src={savedSignature}
                        alt="Saved signature"
                        className="max-w-64 max-h-32 object-contain border bg-white rounded p-2"
                      />
                      <div className="flex justify-end mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSignatureDraft(savedSignature);
                            setEditingSignature(true);
                          }}
                        >
                          Edit Signature
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md text-sm">
                      No signature saved yet. Use the pad below to create one.
                    </div>
                  )}

                  {editingSignature && (
                    <div className="space-y-4">
                      <SignaturePad
                        onSignatureChange={setSignatureDraft}
                        initialSignature={savedSignature}
                        className="border border-dashed border-gray-200 rounded-lg"
                      />
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                          type="button"
                          onClick={handleSignatureSave}
                          disabled={!signatureDraft || saveSignatureMutation.isPending}
                        >
                          {saveSignatureMutation.isPending ? "Saving..." : "Save Signature"}
                        </Button>
                        {savedSignature && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingSignature(false);
                              setSignatureDraft(savedSignature);
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
