import { useAuth } from "@/lib/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestWithFormData } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Profile() {
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
  });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const isStaffOrAbove = !!user && [
    "academic_staff","department_head","dean","vice_chancellor","assistant_registrar","admin"
  ].includes(user.role);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/users/${user!.id}`, profile);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!passwords.newPassword || passwords.newPassword !== passwords.confirm) {
        throw new Error("Passwords do not match");
      }
      const res = await apiRequest("POST", `/api/users/${user!.id}/reset-password`, { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password Updated" });
      setPasswords({ currentPassword: "", newPassword: "", confirm: "" });
    },
    onError: (e: any) => toast({ title: "Password change failed", description: e.message, variant: "destructive" }),
  });

  const uploadSignatureMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("signature", file);
      const res = await apiRequestWithFormData("POST", `/api/admin/users/${user!.id}/signature`, form);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Signature Uploaded" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (e: any) => toast({ title: "Signature upload failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <span />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={profile.fullName} onChange={(e)=>setProfile(p=>({...p, fullName: e.target.value}))} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={profile.email} onChange={(e)=>setProfile(p=>({...p, email: e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={()=>saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>Save</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input id="currentPassword" type="password" value={passwords.currentPassword} onChange={(e)=>setPasswords(p=>({...p, currentPassword: e.target.value}))} />
              </div>
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" value={passwords.newPassword} onChange={(e)=>setPasswords(p=>({...p, newPassword: e.target.value}))} />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input id="confirm" type="password" value={passwords.confirm} onChange={(e)=>setPasswords(p=>({...p, confirm: e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={()=>changePasswordMutation.mutate()} disabled={changePasswordMutation.isPending}>Change Password</Button>
            </div>

            {isStaffOrAbove && (
              <div>
                <Label htmlFor="signature">Signature (image)</Label>
                <Input id="signature" type="file" accept="image/*" onChange={(e)=>{
                  const f = e.target.files?.[0];
                  if (f) uploadSignatureMutation.mutate(f);
                }} />
              </div>
            )}
          </div>
        </DialogContent>
    </Dialog>
  );
}




