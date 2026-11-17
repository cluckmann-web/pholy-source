export const getPholyWorkspaceCopy = (language: string) => {
  const german = language.startsWith('de');
  return {
    photos: language === 'dev' ? 'photos' : german ? 'Meine Fotos' : 'My photos',
    description: german
      ? 'Deine Sammlung. Klar geordnet und schnell wiedergefunden.'
      : 'Your collection. Thoughtfully organised and easy to explore.',
    allPhotos: german ? 'Alle Fotos' : 'All photos',
    chronological: german ? 'Nach Aufnahmedatum' : 'By capture date',
    sharedImage: german ? 'Geteiltes Bild' : 'Shared image',
    sharedVideo: german ? 'Geteiltes Video' : 'Shared video',
  };
};
