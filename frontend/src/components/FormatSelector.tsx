import { useState, useEffect } from 'react';
import { convert } from '../api';

interface Format {
  id: string;
  name: string;
  description: string;
}

interface FormatSelectorProps {
  selectedFormat: string;
  onSelectFormat: (format: string) => void;
  disabled?: boolean;
}

export default function FormatSelector({ selectedFormat, onSelectFormat, disabled }: FormatSelectorProps) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    convert.formats()
      .then((data) => {
        setFormats(data);
        if (!selectedFormat && data.length > 0) {
          onSelectFormat(data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Convert to
      </label>
      <select
        value={selectedFormat}
        onChange={(e) => onSelectFormat(e.target.value)}
        disabled={disabled}
        className="input-field"
      >
        {formats.map((format) => (
          <option key={format.id} value={format.id}>
            {format.name} - {format.description}
          </option>
        ))}
      </select>
    </div>
  );
}
