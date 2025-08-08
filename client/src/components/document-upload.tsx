import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

export default function DocumentUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "",
    file: null as File | null,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: data,
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Upload Successful",
        description: `Document uploaded with hash: ${result.hash.substring(0, 16)}...`,
      });
      
      // Reset form
      setFormData({
        title: "",
        description: "",
        type: "",
        file: null,
      });
      
      // Reset file input
      const fileInput = document.getElementById("document-file") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/user"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.type || !formData.file) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and select a file",
        variant: "destructive",
      });
      return;
    }

    const data = new FormData();
    data.append("title", formData.title);
    data.append("description", formData.description);
    data.append("type", formData.type);
    data.append("file", formData.file);

    uploadMutation.mutate(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData({ ...formData, file });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="document-type">Document Type *</Label>
          <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
            <SelectTrigger className="mt-2" data-testid="select-document-type">
              <SelectValue placeholder="Select document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transcript_request">Transcript Request</SelectItem>
              <SelectItem value="enrollment_verification">Enrollment Verification</SelectItem>
              <SelectItem value="grade_report">Grade Report</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="document-title">Document Title *</Label>
          <Input
            id="document-title"
            data-testid="input-document-title"
            type="text"
            required
            className="mt-2"
            placeholder="Enter document title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
      </div>
      
      <div>
        <Label htmlFor="document-file">Upload File *</Label>
        <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
          <div className="space-y-1 text-center">
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label
                htmlFor="document-file"
                className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
              >
                <span>Upload a file</span>
                <input
                  id="document-file"
                  data-testid="input-file"
                  name="file"
                  type="file"
                  className="sr-only"
                  accept=".pdf,.docx"
                  onChange={handleFileChange}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">PDF or DOCX up to 10MB</p>
            {formData.file && (
              <p className="text-sm text-green-600 font-medium">{formData.file.name}</p>
            )}
          </div>
        </div>
      </div>
      
      <div>
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          data-testid="textarea-description"
          rows={3}
          className="mt-2"
          placeholder="Add any additional notes..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      
      <Button
        type="submit"
        className="w-full md:w-auto"
        disabled={uploadMutation.isPending}
        data-testid="button-upload"
      >
        <Upload className="w-4 h-4 mr-2" />
        {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
      </Button>
    </form>
  );
}
