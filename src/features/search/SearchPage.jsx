import { useState } from 'react';
import { searchApi } from './searchApi';
import { Search } from 'lucide-react';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }

    setSearching(true);
    try {
      const res = await searchApi.search(query);
      setResults(res);
    } catch (error) {
      setResults({ chats: [], projects: [], documents: [] });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Search</div>
        <div className="page-desc">Search across chats, projects, and documents</div>
      </div>

      {/* Search form */}
      <div className="section">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Search by keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Results */}
      {results && (
        <div className="section">
          {results.chats?.length === 0 && results.projects?.length === 0 && results.documents?.length === 0 ? (
            <div className="empty">No results found for "{query}"</div>
          ) : (
            <>
              {results.chats?.length > 0 && (
                <>
                  <div className="section-title">Chats ({results.chats.length})</div>
                  {results.chats.map((chat) => (
                    <div key={chat.id} className="list-item">
                      <div style={{ flex: 1 }}>
                        <div className="list-item-name">{chat.title || 'Untitled'}</div>
                        <div className="list-item-meta">{new Date(chat.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {results.projects?.length > 0 && (
                <>
                  <div className="section-title">Projects ({results.projects.length})</div>
                  {results.projects.map((project) => (
                    <div key={project.id} className="list-item">
                      <div style={{ flex: 1 }}>
                        <div className="list-item-name">{project.name}</div>
                        <div className="list-item-meta">System prompt: {project.system_prompt?.slice(0, 40)}...</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {results.documents?.length > 0 && (
                <>
                  <div className="section-title">Documents ({results.documents.length})</div>
                  {results.documents.map((doc) => (
                    <div key={doc.id} className="list-item">
                      <div style={{ flex: 1 }}>
                        <div className="list-item-name">{doc.title || 'Untitled'}</div>
                        <div className="list-item-meta">Updated {new Date(doc.updated_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {!results && !query && (
        <div className="empty">
          <div className="empty-icon"><Search size={24} /></div>
          <div>Enter a search query to get started</div>
        </div>
      )}
    </div>
  );
}
