import fs from "fs";

import path from "path";



export function getWorkspacePath(projectId: string) {

  return path.join("/workspaces", projectId);

}



export function ensureWorkspace(projectId: string) {

  const workspacePath = getWorkspacePath(projectId);



  if (!fs.existsSync(workspacePath)) {

    fs.mkdirSync(workspacePath, { recursive: true });



    fs.writeFileSync(

      path.join(workspacePath, "index.js"),

      `console.log("Project ${projectId} loaded")`

    );

  }



  return workspacePath;

}



export function writeWorkspaceFile(

  projectId: string,

  fileName: string,

  content: string

) {

  const workspacePath = ensureWorkspace(projectId);

  const filePath = path.join(workspacePath, fileName);



  fs.writeFileSync(filePath, content);



  return filePath;

}



export function readWorkspaceFile(projectId: string, fileName: string) {

  const workspacePath = ensureWorkspace(projectId);

  const filePath = path.join(workspacePath, fileName);



  if (!fs.existsSync(filePath)) {

    return "";

  }



  return fs.readFileSync(filePath, "utf8");

}



export function listWorkspaceFiles(projectId: string) {

  const workspacePath = ensureWorkspace(projectId);



  return fs.readdirSync(workspacePath).map((name) => {

    const filePath = path.join(workspacePath, name);



    return {

      name,

      content: fs.statSync(filePath).isFile()

        ? fs.readFileSync(filePath, "utf8")

        : "",

      isDirectory: fs.statSync(filePath).isDirectory(),

    };

  });

}
