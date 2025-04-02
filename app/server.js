const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8080;

// Middleware
app.use(bodyParser.json());

// Create code directory if it doesn't exist
const codeDir = path.join(__dirname, '../code');
if (!fs.existsSync(codeDir)) {
  fs.mkdirSync(codeDir, { recursive: true });
}

// Execute code endpoint
app.post('/execute', (req, res) => {
  const { language, code, stdin = '' } = req.body;
  
  if (!language || !code) {
    return res.status(400).json({ error: 'Language and code are required' });
  }
  
  const id = uuidv4();
  const codeFilePath = path.join(codeDir, `${id}`);
  
  let extension, compileCmd, runCmd;
  
  switch (language.toLowerCase()) {
    case 'java':
      extension = '.java';
      // Extract class name from Java code
      const classNameMatch = code.match(/public\s+class\s+(\w+)/);
      const className = classNameMatch ? classNameMatch[1] : 'Main';
      
      // For Java, use the class name as the file name
      fs.writeFileSync(`${codeDir}/${className}${extension}`, code);
      compileCmd = `javac ${codeDir}/${className}${extension}`;
      runCmd = `java -cp ${codeDir} ${className}`;
      break;
      
    case 'python':
      extension = '.py';
      fs.writeFileSync(`${codeFilePath}${extension}`, code);
      compileCmd = null; // Python doesn't need compilation
      runCmd = `python3 ${codeFilePath}${extension}`;
      break;
      
    case 'c':
      extension = '.c';
      fs.writeFileSync(`${codeFilePath}${extension}`, code);
      compileCmd = `gcc ${codeFilePath}${extension} -o ${codeFilePath}`;
      runCmd = codeFilePath;
      break;
      
    default:
      return res.status(400).json({ error: 'Unsupported language' });
  }
  
  // Create stdin file if provided
  if (stdin) {
    fs.writeFileSync(`${codeFilePath}.stdin`, stdin);
    runCmd += ` < ${codeFilePath}.stdin`;
  }
  
  // Function to execute command with timeout
  const executeCommand = (command, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const process = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          reject({ error: error.message, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  };
  
  // Compile and run
  const compileAndRun = async () => {
    try {
      // Compile if needed
      if (compileCmd) {
        await executeCommand(compileCmd);
      }
      
      // Run
      const result = await executeCommand(runCmd);
      return res.json({
        id,
        language,
        output: result.stdout,
        error: result.stderr
      });
    } catch (err) {
      return res.json({
        id,
        language,
        output: '',
        error: err.stderr || err.error || 'Execution error'
      });
    } finally {
      // Cleanup files
      setTimeout(() => {
        try {
          if (fs.existsSync(`${codeFilePath}${extension}`)) {
            fs.unlinkSync(`${codeFilePath}${extension}`);
          }
          if (fs.existsSync(codeFilePath)) {
            fs.unlinkSync(codeFilePath);
          }
          if (fs.existsSync(`${codeFilePath}.stdin`)) {
            fs.unlinkSync(`${codeFilePath}.stdin`);
          }
          // Remove class files for Java
          if (language.toLowerCase() === 'java') {
            const classFiles = fs.readdirSync(codeDir)
                              .filter(file => file.endsWith('.class'));
            classFiles.forEach(file => {
              fs.unlinkSync(path.join(codeDir, file));
            });
          }
        } catch (e) {
          console.error('Error cleaning up:', e);
        }
      }, 1000);
    }
  };
  
  compileAndRun();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Code execution server running on port ${PORT}`);
});
