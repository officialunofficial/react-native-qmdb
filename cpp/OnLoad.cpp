#include <NitroModules/HybridObjectRegistry.hpp>
#include "HybridQMDB.hpp"

// Register the QMDB HybridObject at library load time.
// This makes it available to JS via NitroModules.createHybridObject("QMDB").

struct QMDBRegistrar {
  QMDBRegistrar() {
    margelo::nitro::HybridObjectRegistry::registerHybridObjectConstructor(
      "QMDB",
      []() -> std::shared_ptr<margelo::nitro::HybridObject> {
        return std::make_shared<margelo::nitro::qmdb::HybridQMDB>();
      });
  }
};

static QMDBRegistrar _registrar;
