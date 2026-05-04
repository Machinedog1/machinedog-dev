export default function ProjectPage({ params }: any) {
  return (
    <div style={{ padding: 20 }}>
      <h1>Project ID:</h1>
      <h2>{params.id}</h2>
    </div>
  );
}