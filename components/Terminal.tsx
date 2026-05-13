"use client";



import { useEffect, useRef } from "react";

import { io } from "socket.io-client";



export default function WebTerminal() {

  const terminalRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    let term: any;



    async function startTerminal() {

      const { Terminal } = await import("xterm");

      const { FitAddon } = await import("xterm-addon-fit");



      await import("xterm/css/xterm.css");



      if (!terminalRef.current) return;



      const socket = io();



      term = new Terminal({

        cursorBlink: true,

        theme: {

          background: "#000000",

          foreground: "#00ff00",

        },

      });



      const fitAddon = new FitAddon();



      term.loadAddon(fitAddon);



      term.open(terminalRef.current);



      fitAddon.fit();



      socket.on("terminal:data", (data) => {

        term.write(data);

      });



      term.onData((data: string) => {

        socket.emit("terminal:write", data);

      });



      window.addEventListener("resize", () => {

        fitAddon.fit();

      });

    }



    startTerminal();



    return () => {

      if (term) term.dispose();

    };

  }, []);



  return (

    <div

      ref={terminalRef}

      style={{

        width: "100%",

        height: "400px",

        background: "#000",

      }}

    />

  );

}
