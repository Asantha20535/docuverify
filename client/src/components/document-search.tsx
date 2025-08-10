import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Filter, X } from "lucide-react";
import type { Document } from "@/types";

interface DocumentSearchProps {
  documents: Document[];
  onSearchChange: (filteredDocuments: Document[]) => void;
  placeholder?: string;
  showTypeFilter?: boolean;
}

export default function DocumentSearch({ 
  documents, 
  onSearchChange, 
  placeholder = "Search documents...",
  showTypeFilter = true 
}: DocumentSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [isFilterActive, setIsFilterActive] = useState(false);

  // Get unique document types for the filter
  const documentTypes = useMemo(() => {
    const types = documents
      .map(doc => doc.type)
      .filter(type => type && type.trim() !== ""); // Filter out empty, null, or undefined types
    return Array.from(new Set(types)).sort();
  }, [documents]);

  // Filter documents based on search term and type
  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    // Filter by search term
    if (searchTerm.trim()) {
      filtered = filtered.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by document type
    if (selectedType) {
      filtered = filtered.filter(doc => doc.type === selectedType);
    }

    return filtered;
  }, [documents, searchTerm, selectedType]);

  // Update parent component with filtered results
  useEffect(() => {
    onSearchChange(filteredDocuments);
  }, [filteredDocuments, onSearchChange]);

  // Check if any filters are active
  const hasActiveFilters = searchTerm.trim() || selectedType;

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm("");
    setSelectedType("");
    setIsFilterActive(false);
  };

  // Format document type for display
  const formatDocumentType = (type: string) => {
    if (!type || typeof type !== 'string') return 'Unknown Type';
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Document Type Filter */}
        {showTypeFilter && documentTypes.length > 0 && (
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {formatDocumentType(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="shrink-0"
          >
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-500">Active filters:</span>
          
          {searchTerm.trim() && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Search: "{searchTerm}"
              <button
                onClick={() => setSearchTerm("")}
                className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          
          {selectedType && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Type: {formatDocumentType(selectedType)}
              <button
                onClick={() => setSelectedType("")}
                className="ml-1 hover:bg-green-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          
          <span className="text-sm text-gray-500">
            Showing {filteredDocuments.length} of {documents.length} documents
          </span>
        </div>
      )}

      {/* No Results Message */}
      {hasActiveFilters && filteredDocuments.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm">Try adjusting your search terms or filters</p>
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="mt-3"
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
