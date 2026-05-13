import ProjectClient from "./ProjectClient";



type PageProps = {

  params: Promise<{

    id: string;

  }>;

};



export default async function ProjectPage({ params }: PageProps) {

  const { id } = await params;



  return (

    <main style={{ height: "100vh" }}>

      <ProjectClient projectId={id} />

    </main>

  );

}
