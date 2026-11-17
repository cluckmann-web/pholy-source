export const getPholyNavigationCopy = (language: string) =>
  language.startsWith('de')
    ? {
        myPhotos: 'Meine Fotos',
        profile: 'Profil & Einstellungen',
        menu: 'Menü',
        library: 'Mediathek',
        sharing: 'Gemeinsam',
        organize: 'Organisieren',
        account: 'Konto',
      }
    : {
        myPhotos: 'My photos',
        profile: 'Profile & settings',
        menu: 'Menu',
        library: 'Library',
        sharing: 'Together',
        organize: 'Organize',
        account: 'Account',
      };
