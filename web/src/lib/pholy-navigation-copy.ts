export const getPholyNavigationCopy = (language: string) =>
  language.startsWith('de')
    ? {
        myPhotos: 'Meine Fotos',
        profile: 'Profil & Einstellungen',
        menu: 'Menü',
      }
    : {
        myPhotos: 'My photos',
        profile: 'Profile & settings',
        menu: 'Menu',
      };
