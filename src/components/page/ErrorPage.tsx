interface ErrorPageProps {
  title: string;
  description: string;
}

export default function ErrorPage({ title, description }: ErrorPageProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 text-white">
      <div className="text-center max-w-md">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">{title}</h1>
        <p className="text-neutral-400">{description}</p>
      </div>
    </div>
  );
}
