const http = require("http");

const next = require("next");

const { Server } = require("socket.io");

const pty = require("node-pty");



const dev = true;

const hostname = "0.0.0.0";

const port = 3000;



const app = next({ dev, hostname, port });

const handle = app.getRequestHandler();



app.prepare().then(() => {

  const server = http.createServer((req, res) => {

    handle(req, res);

  });



  const io = new Server(server);



  io.on("connection", (socket) => {

    console.log("Terminal connected");



    const shell = "bash";



    const ptyProcess = pty.spawn(shell, [], {

      name: "xterm-color",

      cols: 80,

      rows: 24,

      cwd: process.env.HOME,

      env: process.env,

    });



    ptyProcess.onData((data) => {

      socket.emit("terminal:data", data);

    });



    socket.on("terminal:write", (data) => {

      ptyProcess.write(data);

    });



    socket.on("disconnect", () => {

      ptyProcess.kill();

    });

  });



  server.listen(port, () => {

    console.log(`> Ready on http://${hostname}:${port}`);

  });

});
