import EbookStudio from "./ebook-studio";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "./chatgpt-auth";
import styles from "./account.module.css";

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className={styles.signInPage}>
        <section className={styles.signInCard}>
          <div className={styles.mark}>EB</div>
          <span className={styles.eyebrow}>EB Studio Pro Cloud</span>
          <h1>One account. Every book. Every device.</h1>
          <p>
            Sign in once to keep your manuscripts, Visual Mini eBooks, comics,
            and future EB Studio projects together across iPhone, iPad, Mac,
            and any browser you use next.
          </p>
          <a className={styles.primaryButton} href={chatGPTSignInPath("/")}>
            Sign in to EB Studio Pro
          </a>
          <div className={styles.featureRow}>
            <span>☁️ Cross-device library</span>
            <span>↻ Automatic sync</span>
            <span>💾 Local safety copy</span>
          </div>
          <small>
            Your current device projects remain local until you sign in. After
            sign-in, EB Studio merges the newest local and cloud copies instead
            of deleting either one.
          </small>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.accountWorkspace}>
      <div className={styles.accountBar}>
        <div>
          <span className={styles.syncDot} aria-hidden="true" />
          <strong>{user.displayName}</strong>
          <small>{user.email}</small>
        </div>
        <div className={styles.accountActions}>
          <span>☁️ Cloud library enabled</span>
          <a href={chatGPTSignOutPath("/")}>Sign out</a>
        </div>
      </div>
      <EbookStudio />
    </div>
  );
}
