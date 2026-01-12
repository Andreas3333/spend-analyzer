import { useState, useCallback } from 'react';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { list } from 'aws-amplify/storage';
import {
  Box,
  Heading,
  Text,
  Button,
  Alert,
  AlertIcon,
  Icon,
} from '@chakra-ui/react';
import { LuUpload } from 'react-icons/lu';
import { useDropzone } from 'react-dropzone';

function parseLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

function parseCSV(text) {
  const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // remove possible trailing empty lines
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (rows.length === 0) return { header: [], rows: [] };
  const header = parseLine(rows[0]);
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].trim() === '') continue;
    data.push(parseLine(rows[i]));
  }
  return { header, rows: data };
}

export default function UploadTransactions() {
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const MAX_DATASETS = 5;
  const MAX_ROWS = 500;

  const handleFile = useCallback(async (file) => {
    setError(null);

    if (!file) return;

    // Enforce MIME type 'text/csv'
    if (file.type !== 'text/csv') {
      setError('Only files with MIME type text/csv are accepted.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are accepted.');
      return;
    }

    // Enforce 5 dataset maximum in user-data bucket
    try {
      const { username, userId } = await getCurrentUser();
      const result = await list({ path: `${username}/` });
      if (result.items.length > MAX_DATASETS) {
        setError(`Failed to upload ${file.name}. The maximum number of allowed datasets is ${MAX_DATASETS}.`);
        return;
      }
    } catch (error) {
      console.error('Error listing files:', error);
      return;
    }

    // Validate Required columns
    try {
      const text = await file.text();
      const { header, rows } = parseCSV(text);
      const normalized = header.map(h => (h || '').toLowerCase().trim());
      const hasText = normalized.includes('text')
        || normalized.includes('transactions description')
        || normalized.includes('transaction description')
        || normalized.some(h => h.includes('description'));
      if (!hasText) {
        setError('CSV must include a `text` or `Transaction Description` column.');
        return;
      }
      if (rows.length > MAX_ROWS) {
        setError(`CSV contains ${rows.length} rows. Maximum allowed is ${MAX_ROWS}.`);
        return;
      }

      // Upload call
      try {
        const [fileName, fileExtension] = file.name.split('.')
        const dsName = `${fileName}-upload.${fileExtension}`;
        if (file && file instanceof File) {
          await uploadToBackend(file, dsName);
        }
      } catch (err) {
        console.error('Upload to backend failed', err);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to read or parse the CSV file.');
    }
  });

  async function uploadToBackend(file, dsName) {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      // Base64 encode csv file for POST
      const text = await file.text();
      const b64 = btoa(unescape(encodeURIComponent(text)));
      const payload = { csv: b64 };

      const API_BASE = import.meta.env.VITE_API_BASE || '';
      if (import.meta.env.PROD && !API_BASE) {
        throw new Error('Set VITE_API_BASE to API base URL.');
      }
      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const url = `${base}/classify_transactions?dataset=${encodeURIComponent(dsName)}`

      const headers = { 'Content-Type': 'application/json' };
      headers['Authorization'] = `Bearer ${idToken}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("Failed to upload dataset");
      } else {
        setInfo(`Dataset: ${dsName} uploaded`)
        console.log(`Dataset: ${dsName} uploaded`)
        const raw = localStorage.getItem('pendingDatasets');
        const curPending = raw ? JSON.parse(raw) : [];
        if (!curPending.includes(dsName)) {
          localStorage.setItem('pendingDatasets', JSON.stringify([...curPending, dsName]));
        }

        // 2. Dispatch the event that Dashboard.jsx is listening for
        window.dispatchEvent(new Event('pendingDatasetsChanged'));
      }
    } catch (err) {
      console.error(err);
      setError('Upload failed: ' + (err.message || err));
    }
  }

  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] }, maxFiles: 1 });

  return (
    <Box p={6} borderWidth={1} borderRadius="md" bg="white" boxShadow="sm">
      <Heading size="md" mb={3}>Upload Transactions CSV</Heading>
      <Text mb={3} color="gray.600">Select a CSV file. Must contain a <strong>text</strong> or <strong>Transaction Description</strong> column. Max 500 rows.</Text>
      <Box>
        <Box
          {...getRootProps()}
          borderWidth={2}
          borderStyle="dashed"
          borderColor={isDragActive ? 'blue.400' : 'gray.200'}
          borderRadius="md"
          p={4}
        >
          <input {...getInputProps()} />
          <Box display="flex" alignItems="center" gap={3}>
            <Icon as={LuUpload} boxSize={6} color="gray.500" />
            <Box>
              <Text>Drag & drop a CSV here, or click to select a file</Text>
              <Text fontSize="sm" color="gray.500">Only .csv files; must include `text` or `Transaction Description` column.</Text>
            </Box>
          </Box>
        </Box>
        <Button mt={3} onClick={() => { const el = document.querySelector('input[type=file]'); if (el) el.click(); }}>
          Choose file
        </Button>
      </Box>
      {error && (
        <Alert status="error" mt={4} borderRadius="md">
          <AlertIcon />{error}
        </Alert>
      )}
    </Box>
  );
}
