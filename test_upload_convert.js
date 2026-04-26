const fs = require('fs');
const path = require('path');

async function runTest() {
  const filePath = path.join(__dirname, 'test_video.mp4');
  const formData = new FormData();
  formData.append('file', new Blob([fs.readFileSync(filePath)]), 'test_video.mp4');

  console.log('1. Uploading file...');
  const uploadRes = await fetch('http://localhost:3001/api/upload', {
    method: 'POST',
    body: formData
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  console.log('Upload successful:', uploadData);

  const fileId = uploadData.fileId;

  console.log('\n2. Starting conversion...');
  const convertRes = await fetch('http://localhost:3001/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, outputFormat: 'gif' })
  });

  if (!convertRes.ok) {
    throw new Error(`Conversion failed: ${await convertRes.text()}`);
  }

  const convertData = await convertRes.json();
  console.log('Conversion started:', convertData);

  const jobId = convertData.jobId;

  console.log('\n3. Polling job status...');
  while (true) {
    const statusRes = await fetch(`http://localhost:3001/api/convert/job/${jobId}`);
    if (!statusRes.ok) {
      throw new Error(`Status check failed: ${await statusRes.text()}`);
    }

    const statusData = await statusRes.json();
    console.log(`Status: ${statusData.status}, Progress: ${statusData.progress}%`);

    if (statusData.status === 'completed' || statusData.status === 'failed') {
      console.log('Final Job Data:', statusData);
      break;
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

runTest().catch(console.error);
