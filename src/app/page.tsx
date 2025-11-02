import AnimatedPage, { FadeInUp, FadeOut } from "@/components/AnimatedPage";
import Navbar from "@/components/Navbar";
import UploadBox from "@/components/UploadBox";

export default function Home() {
  return (
    <>
      <FadeOut>
        <Navbar />
      </FadeOut>

      <AnimatedPage>
        <FadeInUp>
          <main className="w-full overflow-hidden">
            <FadeInUp>
              <section className="mx-auto min-h-[calc(100vh-4rem)] grid place-items-center px-4 sm:px-6 lg:px-8 w-full">
                <div className="w-full max-w-6xl overflow-hidden">
                  <UploadBox />
                </div>
              </section>
            </FadeInUp>
          </main>
        </FadeInUp>
      </AnimatedPage>
    </>
  );
}
