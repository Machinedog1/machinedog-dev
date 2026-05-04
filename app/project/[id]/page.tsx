import ProjectClient from "./ProjectClient";

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectClient id={params.id} />;
}

export default function Page({ params }: { params: { id: string } }) {
  console.log("SERVER PARAMS:", params);
  return <ProjectClient id={params.id} />;
}