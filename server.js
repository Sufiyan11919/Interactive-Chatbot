const express = require("express");
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files from the public folder
app.use(express.static("public"));

// Start the server on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
