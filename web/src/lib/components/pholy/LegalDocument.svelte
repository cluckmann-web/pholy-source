<script lang="ts">
  import PholyPublicLayout from '#lib/components/layouts/PholyPublicLayout.svelte';

  let {
    title,
    subtitle,
    sections,
    dated = false,
  }: {
    title: string;
    subtitle: string;
    sections: Array<{ title: string; paragraphs: string[]; links?: Array<{ label: string; href: string }> }>;
    dated?: boolean;
  } = $props();
</script>

<svelte:head><title>{title} · PHOLY</title><meta name="description" content={subtitle} /></svelte:head>
<PholyPublicLayout {title} {subtitle}>
  <div class="document" lang="de">
    <aside>
      <p>Auf dieser Seite</p>
      <nav aria-label="Inhalt">
        {#each sections as section, i (section.title)}<a href={'#abschnitt-' + i}>{section.title}</a>{/each}
      </nav>
      {#if dated}<p class="date">Stand: 17. November 2026</p>{/if}
    </aside>
    <article>
      {#each sections as section, i (section.title)}<section id={'abschnitt-' + i}>
          <h2>{section.title}</h2>
          {#each section.paragraphs as paragraph (paragraph)}<p>
              {paragraph}
            </p>{/each}{#each section.links ?? [] as link (link.href)}<p>
              <a href={link.href} rel={link.href.startsWith('https:') ? 'noreferrer' : undefined}>{link.label} ↗</a>
            </p>{/each}
        </section>{/each}
    </article>
  </div>
</PholyPublicLayout>

<style>
  .document {
    display: grid;
    grid-template-columns: 230px minmax(0, 760px);
    gap: 80px;
    align-items: start;
  }
  aside {
    position: sticky;
    top: 24px;
    font-size: 12px;
    color: #637168;
  }
  aside > p {
    font-weight: 600;
    margin: 0 0 16px;
  }
  nav {
    display: grid;
    gap: 12px;
  }
  a {
    color: inherit;
    text-underline-offset: 4px;
  }
  nav a {
    text-decoration: none;
  }
  nav a:hover {
    text-decoration: underline;
  }
  .date {
    margin-top: 28px !important;
    font-weight: 400 !important;
  }
  section {
    margin-bottom: 40px;
    scroll-margin-top: 28px;
  }
  h2 {
    font-size: 22px;
    font-weight: 550;
    letter-spacing: -0.02em;
    line-height: 1.35;
    margin: 0 0 18px;
  }
  article p {
    font-size: 15px;
    line-height: 1.85;
    color: #42574b;
    margin: 0 0 12px;
    overflow-wrap: anywhere;
  }
  a:focus-visible {
    outline: 2px solid #143e35;
    outline-offset: 4px;
  }
  @media (max-width: 850px) {
    .document {
      grid-template-columns: 1fr;
      gap: 36px;
    }
    aside {
      position: static;
      border-bottom: 1px solid #d8ded4;
      padding-bottom: 28px;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
    }
    h2 {
      font-size: 21px;
    }
    article p {
      font-size: 14px;
    }
  }
  @media print {
    .document {
      display: block;
    }
    aside {
      display: none;
    }
    section {
      break-inside: avoid;
    }
    article p {
      color: black;
    }
    a {
      text-decoration: none;
    }
  }
</style>
