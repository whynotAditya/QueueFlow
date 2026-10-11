import React, { useState, useEffect } from 'react';
import { Search, X, Database } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isSearching }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(searchTerm);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm, onSearch]);

  const handleClear = () => {
    setSearchTerm('');
    onSearch('');
  };

  return (
    <div className="relative flex-1 max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search emails via Elasticsearch (query recipient, subject, body)..."
        className="block w-full pl-9 pr-20 py-2 border border-gray-300 rounded-lg text-xs bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
      />
      <div className="absolute inset-y-0 right-0 pr-2 flex items-center space-x-1.5">
        {searchTerm && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <span
          className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium border border-gray-200"
          title="Powered by Elasticsearch Index"
        >
          <Database className="w-2.5 h-2.5 text-indigo-500" />
          <span>{isSearching ? 'Querying...' : 'Elasticsearch'}</span>
        </span>
      </div>
    </div>
  );
};
