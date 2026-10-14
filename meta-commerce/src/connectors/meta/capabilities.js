// Matriz de capacidades REALES por canal (ver docs/META-APIS.md, investigación oct-2026).
// El sistema decide qué automatizar según esta tabla; nunca asume una API que no existe.
export const CHANNEL_CAPABILITIES = {
  marketplace_personal: {
    label: 'Facebook Marketplace (perfil personal)',
    publish: 'manual', deactivate: 'manual', messages: 'suggested',
    note: 'Meta no ofrece API pública para publicaciones personales de Marketplace (solo socios aprobados de Marketplace Partnerships). Se usa una cola de publicación asistida: el sistema prepara todo y una persona publica/desactiva y confirma.',
  },
  meta_catalog: {
    label: 'Catálogo de Meta (Commerce Manager)',
    publish: 'api', deactivate: 'api', messages: 'none',
    note: 'Oficial: feed programado (CSV por URL) o Catalog Batch API (POST /{catalog_id}/items_batch). Sirve para anuncios de catálogo (Advantage+), no como tienda: Shops no está disponible en Argentina.',
  },
  messenger_page: {
    label: 'Messenger de la Página',
    publish: 'none', deactivate: 'none', messages: 'api',
    note: 'Oficial: Send API (POST /{page_id}/messages) + webhooks. Ventana de 24 h; etiqueta HUMAN_AGENT (7 días) solo para respuestas humanas.',
  },
  instagram_dm: { label: 'Instagram Direct', publish: 'none', deactivate: 'none', messages: 'api', note: 'Oficial vía Messenger Platform / Instagram API. Misma ventana de 24 h.' },
  meta_ads: {
    label: 'Meta Ads', publish: 'api', deactivate: 'api', messages: 'none',
    note: 'Oficial: Marketing API. Campañas se crean en PAUSED y solo se activan con aprobación humana y tope de gasto.',
  },
  website: { label: 'Sitio web', publish: 'none', deactivate: 'none', messages: 'none', note: 'Fuente del catálogo (solo lectura).' },
};

export const capabilitiesFor = kind => CHANNEL_CAPABILITIES[kind] || { publish: 'none', deactivate: 'none', messages: 'none', note: 'Canal desconocido' };
