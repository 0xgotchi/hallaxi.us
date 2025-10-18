import AnimatedPage, { FadeInUp } from "@/components/AnimatedPage";
import { Navbar } from "@/components/Navbar";
import UploadBox from "@/components/UploadBox";

export default function Home() {
  return (
    <>
      <Navbar hidden />
      <AnimatedPage>
        <FadeInUp>
          <main>
            <FadeInUp>
              <section className="mx-auto min-h-[calc(100vh-4rem)] grid place-items-center">
                <div className="w-full max-w-6xl px-4 sm:px-6 lg:px-8">
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
