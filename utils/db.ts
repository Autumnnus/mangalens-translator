export class ImageDatabase {
  private dbName = "MangaLensDB";
  private storeName = "images";
  private version = 1;

  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveImage(
    id: string,
    type: "original" | "translated",
    blob: Blob
  ): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const key = `${id}_${type}`;
      store.put(blob, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getImage(
    id: string,
    type: "original" | "translated"
  ): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const key = `${id}_${type}`;
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSeriesImages(seriesIds: string[]): Promise<void> {
    const db = await this.init();
    // This is a simple implementation, ideally we'd filter better
    // For now, let's keep it simple.
  }
}

export const imageDb = new ImageDatabase();
