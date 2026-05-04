import ProjectClient from "./ProjectClient";

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectClient id={params.id} />;
}